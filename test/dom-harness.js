/**
 * Harness de navegador para `web/app.js` (F7; execuções 8 e 9).
 *
 * `web/app.js` é o único arquivo que liga decisão → estado → tela → canal → fonia, e ele roda no
 * navegador: para testá-lo é preciso um `document`, uma `window` e um `SpeechSynthesis` mínimos. O
 * harness é compartilhado porque três cenários precisam do app com stubs **diferentes** — fonia
 * (PTT indisponível), PTT com microfone falso e armazenamento bloqueado — e cada arquivo de teste é
 * um processo próprio, ou seja, uma instância nova do módulo.
 *
 * Nada aqui substitui a conferência humana de microfone e vozes (README, "Testes e limitações de
 * voz"): o harness prova o **caminho de código**, não o som.
 */

/** `document` mínimo: só o que `web/app.js` usa, com seletores memoizados e filhos por seletor. */
function makeElement(selector) {
  const children = new Map()
  return {
    selector, className: '', textContent: '', innerHTML: '', value: '', disabled: false, hidden: false, title: '',
    style: {}, dataset: {}, handlers: {}, appended: [],
    classList: { add() {}, remove() {} },
    setAttribute() {}, removeEventListener() {}, focus() {}, remove() {},
    addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler) },
    append(child) { this.appended.push(child) },
    querySelector(childSelector) {
      if (!children.has(childSelector)) children.set(childSelector, makeElement(`${selector} ${childSelector}`))
      return children.get(childSelector)
    },
  }
}

function fakeRecognition() {
  return class FakeRecognition {
    constructor() { FakeRecognition.instance = this; this.results = []; this.resultIndex = 0; this.lang = null; this.interimResults = false; this.continuous = false }
    start() { this.started = true }
    stop() { setTimeout(() => this.onend?.(), 0) }
    abort() { setTimeout(() => this.onend?.(), 0) }
  }
}

function fakeMediaRecorder() {
  return class FakeMediaRecorder {
    static isTypeSupported() { return true }
    constructor(stream, options) { FakeMediaRecorder.instance = this; this.stream = stream; this.mimeType = options?.mimeType ?? 'audio/webm'; this.state = 'inactive' }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; setTimeout(() => this.onstop?.(), 0) }
  }
}

/** `navigator` é getter-only no Node: definir por `defineProperty` funciona para todos os nomes. */
function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

/**
 * Instala os globals e devolve os controles do app.
 *
 * - `storage`: conteúdo inicial de `localStorage`; `{ throw: true }` simula armazenamento bloqueado
 *   (contexto sandbox, cookies desabilitados) — o app precisa continuar utilizável (M1);
 * - `media`: habilita `SpeechRecognition`, `getUserMedia` e `MediaRecorder` falsos, para o fluxo do
 *   PTT (M2);
 * - `transcript`: texto devolvido por `/api/transcribe`; sem ele o STT remoto falha de propósito.
 */
export function installApp({ scenario = 'vfr_local_pt', storage = {}, media = false, transcript = null } = {}) {
  const elements = new Map()
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, makeElement(selector))
    return elements.get(selector)
  }
  const windowListeners = new Map()
  const windowStub = {
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, [])
      windowListeners.get(type).push(handler)
    },
    removeEventListener(type, handler) {
      const current = windowListeners.get(type) ?? []
      const index = current.indexOf(handler)
      if (index >= 0) current.splice(index, 1)
    },
  }
  const speech = {
    spoken: [], pending: [],
    speak(utterance) { this.spoken.push(utterance); this.pending.push(utterance) },
    /** `onend` controlado pelo teste: o canal só volta a livre quando o áudio realmente termina. */
    finishSpeech() { for (const utterance of this.pending.splice(0)) utterance.onend?.() },
  }
  const localStorageStub = storage.throw
    ? { getItem() { throw new Error('acesso a armazenamento bloqueado') }, setItem() { throw new Error('acesso a armazenamento bloqueado') }, removeItem() { throw new Error('acesso a armazenamento bloqueado') } }
    : { getItem: (key) => (key in storage ? storage[key] : null), setItem() {}, removeItem() {} }

  defineGlobal('document', { querySelector: element, querySelectorAll: () => [], createElement: () => makeElement('article') })
  defineGlobal('window', windowStub)
  defineGlobal('location', { search: '' })
  defineGlobal('localStorage', localStorageStub)
  defineGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text } })
  defineGlobal('speechSynthesis', { getVoices: () => [], cancel() {}, speak: (utterance) => speech.speak(utterance) })
  // Sem LLM: o interpretador responde erro e o pipeline segue pelo caminho determinístico, com
  // grounding. O STT remoto só responde quando o teste fornece a transcrição.
  defineGlobal('fetch', async (url) => (String(url).includes('/api/transcribe') && transcript)
    ? new Response(JSON.stringify({ transcript }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response(JSON.stringify({ error: transcript ? 'llm_unavailable' : 'stt_error' }), { status: 503, headers: { 'content-type': 'application/json' } }))
  if (media) {
    defineGlobal('SpeechRecognition', fakeRecognition())
    defineGlobal('MediaRecorder', fakeMediaRecorder())
    defineGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } })
  }
  // O cenário vem do `<select>`: no stub precisa estar definido antes do `startScenario`.
  element('#scenario').value = scenario

  return {
    element, speech, windowListeners,
    channelLabel: () => element('#channel-status').textContent,
    modelStatus: () => element('#model-status').textContent,
    modelSelectValue: () => element('#model').value,
    pilotMessages: () => element('#transcript').appended.filter(({ className }) => /\bpilot\b/.test(className)).map((article) => article.querySelector('p').textContent),
    atcoMessages: () => element('#transcript').appended.filter(({ className }) => /\batco\b/.test(className)).map((article) => article.querySelector('p').textContent),
    submit(text) { element('#transmission').value = text; element('#transmission-form').handlers.submit[0]({ preventDefault() {} }) },
    pressPtt() { element('#ptt').handlers.pointerdown[0]({ preventDefault() {} }) },
    /** Soltura em qualquer lugar da tela — o requisito do F4. */
    releasePtt(event = {}) { for (const handler of windowListeners.get('pointerup') ?? []) handler(event) },
    blurWindow() { for (const handler of windowListeners.get('blur') ?? []) handler({ type: 'blur' }) },
  }
}

/** Espera uma condição observável, com mensagem de falha legível. */
export async function until(predicate, message, timeoutMs = 3_000) {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`tempo esgotado: ${message}`)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

/**
 * Instala o harness e carrega `web/app.js`. O import é dinâmico porque os globais precisam existir
 * **antes** de o módulo avaliar, e leva uma query para dar uma instância nova por `tag` — o navegador
 * faz o equivalente recarregando a página, e assim cada cenário vê seus próprios stubs.
 */
export async function loadApp(options = {}, tag = 'default') {
  const app = installApp(options)
  await import(`../web/app.js?harness=${tag}`)
  return app
}
