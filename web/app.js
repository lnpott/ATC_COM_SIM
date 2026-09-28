import { normalizePhraseology } from '../src/normalization.js';
import { processTransmission } from '../src/pipeline.js';
import { SCENARIOS, getScenario } from '../src/scenarios.js';
import { ManualSearch } from '../src/search.js';
import { createRecognitionSession, speakTransmission } from '../src/speech.js';
import { createAudioCaptureSession } from '../src/audio-capture.js';
import { limitedSessionContext } from '../src/llm/semantic-interpreter.js';
// O navegador corta o contexto pelo teto conservador antes do transporte; o servidor corta de novo,
// agora pelo orçamento real do candidato que vai ser tentado (F6).
import { DEFAULT_INPUT_BUDGET_TOKENS, trimSessionContext } from '../src/llm/context-budget.js';
import { requestSemanticInterpretation } from '../src/services/interpretTransmission.js';
import { transcribeAudioFree } from '../src/services/transcribeAudio.js';
import { applyStateUpdate, createSimulationState, recordTransmission } from '../src/state-machine.js';
import { buildSessionReport } from '../src/training.js';
import { CHANNEL_LABELS, CHANNEL_STATES, createChannelStateMachine } from '../src/ptt-state.js';
import { shouldSpeak, silenceReason } from '../src/tts-policy.js';
// Lista pública de candidatos gratuitos: são identificadores documentados em server/model-registry.js,
// sem credencial alguma. O navegador precisa dos nomes para o seletor; a prioridade é aplicada no
// servidor, que continua dono da ordem e do fallback.
import { FREE_LLM_CANDIDATES } from '../server/model-registry.js';

const $ = (selector) => document.querySelector(selector);
let search;
let state;
let idioma;
let evaluations = [];
/**
 * Suporte real a voz (F7, item 3 do inventário do `App.jsx`): o simulador documental precisa
 * declarar a degradação para entrada/saída por texto em vez de falhar de forma silenciosa.
 */
const speechRecognitionSupported = Boolean(globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition);
const speechSynthesisSupported = typeof globalThis.speechSynthesis?.speak === 'function';
let voiceEnabled = speechSynthesisSupported;
let recognitionSession = null;
let pttOperation = null;
let transmissionInFlight = false;
let speechPending = false;
let sessionId = crypto.randomUUID();
const processedPttSessions = new Set();
const diagnosticMode = new URLSearchParams(location.search).has('debug');
if (diagnosticMode) window.__ATC_DEBUG__ = [];

const PREFERRED_MODEL_KEY = 'atc.preferredModelId';
/**
 * A preferência de modelo é opcional: armazenamento bloqueado (contexto sandbox, cookies
 * desabilitados) não pode derrubar o simulador inteiro (M1). O acesso vai por aqui e a sessão segue
 * em "automático" quando nada pode ser lido ou gravado.
 */
const safeStorage = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* sem persistência */ } },
  remove: (key) => { try { localStorage.removeItem(key); } catch { /* sem persistência */ } },
};
/**
 * A preferência persistida só vale se o modelo ainda existir no catálogo (B4): um id guardado de
 * outra sessão fazia o seletor mostrar "Automático" e o indicador dizer "preferido: …" ao mesmo
 * tempo. Normalizar na leitura deixa seletor, indicador e transporte falando do mesmo modelo.
 */
let preferredModelId = normalizePreference(safeStorage.get(PREFERRED_MODEL_KEY));

function normalizePreference(value) {
  return modelCandidates().includes(value) ? value : '';
}

/**
 * Canal de rádio (F4): `livre` / `transmitindo` / `recebendo`. Os estágios internos do pipeline
 * (STT, interpretação, busca) continuam existindo apenas no diagnóstico — o rótulo do PTT mostra
 * o estado do canal, e o botão fica indisponível enquanto a frequência está ocupada.
 */
const channel = createChannelStateMachine({ onChange: (stateName) => renderChannel(stateName) });

function renderChannel(stateName = channel.state) {
  const button = $('#ptt');
  button.dataset.state = stateName;
  button.querySelector('small').textContent = speechRecognitionSupported
    ? CHANNEL_LABELS[stateName] ?? CHANNEL_LABELS.livre
    : 'VOZ INDISPONÍVEL · USE O TEXTO';
  const busy = !channel.canTransmit || !speechRecognitionSupported;
  button.disabled = busy;
  button.setAttribute('aria-disabled', String(busy));
  button.title = speechRecognitionSupported ? '' : 'Entrada por voz indisponível neste navegador.';
  const status = $('#channel-status');
  if (status) { status.textContent = stateName.toUpperCase(); status.dataset.state = stateName; }
}

function modelCandidates() {
  return FREE_LLM_CANDIDATES.filter(({ provider }) => provider === 'openrouter').map(({ id }) => id);
}

function renderModelSelect() {
  const select = $('#model');
  if (!select) return;
  select.innerHTML = ['<option value="">Automático (cascata gratuita)</option>']
    .concat(modelCandidates().map((id) => `<option value="${id}">${id}</option>`))
    .join('');
  select.value = preferredModelId;
}

/** Uma única vez, fora do render: readicionar a cada render duplicaria a gravação da preferência. */
function bindModelSelect() {
  const select = $('#model');
  if (!select) return;
  select.addEventListener('change', () => {
    preferredModelId = select.value;
    if (preferredModelId) safeStorage.set(PREFERRED_MODEL_KEY, preferredModelId);
    else safeStorage.remove(PREFERRED_MODEL_KEY);
    renderModelStatus(null);
  });
}

/**
 * Indicador do modelo que respondeu de fato (F5) — visível fora do modo `?debug=1`, com marca de
 * troca automática quando houve fallback. A seleção do usuário prioriza; nunca desliga o failover.
 */
function renderModelStatus(semantic) {
  const element = $('#model-status');
  if (!element) return;
  if (!semantic) {
    element.textContent = preferredModelId ? `preferido: ${preferredModelId}` : 'automático';
    element.dataset.fallback = 'false';
    return;
  }
  if (semantic.error) {
    element.textContent = `interpretação determinística (${semantic.error})`;
    element.dataset.fallback = 'false';
    return;
  }
  const model = semantic.actualModel ?? semantic.requestedModel ?? 'desconhecido';
  const depth = Number(semantic.fallbackDepth ?? 0);
  element.textContent = `${semantic.provider ?? 'llm'} · ${model}${depth > 0 ? ` ↻ alternativa ${depth}` : ''}`;
  element.dataset.fallback = String(depth > 0);
}

/**
 * Aviso de degradação da voz (F7, itens 3 e 9 do inventário): sem Web Speech o simulador continua
 * utilizável por texto — e o usuário precisa saber disso antes de apertar o PTT, não depois.
 */
function renderSpeechSupport() {
  const warning = $('#speech-warning');
  if (!warning) return;
  const notices = [];
  if (!speechRecognitionSupported) notices.push('Entrada por voz indisponível neste navegador (Web Speech): use o campo de texto.');
  if (!speechSynthesisSupported) notices.push('Fonia indisponível neste navegador: as respostas do controlador aparecem apenas como texto.');
  warning.hidden = notices.length === 0;
  warning.textContent = notices.join(' ');
  const soundToggle = $('#sound-toggle');
  if (soundToggle && !speechSynthesisSupported) {
    soundToggle.textContent = '○ MUDO';
    soundToggle.disabled = true;
    soundToggle.title = 'Fonia indisponível neste navegador.';
  }
}

/**
 * Idioma da sessão (F7, item 1 do inventário — "portar com restrição"): o idioma **não** é uma
 * preferência livre. Ele determina a base documental recuperada (`ManualSearch`, artigos em `pt`
 * ou `pt-en`), a voz do TTS e a fraseologia usada pelo controlador. Por isso a alternância troca
 * para o **cenário equivalente** no outro idioma e reinicia a sessão, em vez de traduzir a
 * conversa em curso e misturar bases documentais.
 */
function languageSibling(scenarioId) {
  const sibling = scenarioId.endsWith('_pt') ? `${scenarioId.slice(0, -3)}_en` : scenarioId.endsWith('_en') ? `${scenarioId.slice(0, -3)}_pt` : null;
  return sibling && SCENARIOS[sibling] ? sibling : null;
}

function renderLanguage() {
  const status = $('#language-status');
  const toggle = $('#language-toggle');
  const sibling = languageSibling($('#scenario').value);
  if (status) status.textContent = idioma === 'en' ? 'EN' : 'PT';
  if (!toggle) return;
  toggle.disabled = !sibling;
  toggle.setAttribute('aria-disabled', String(!sibling));
  toggle.title = sibling
    ? `Reiniciar a sessão no cenário equivalente (${SCENARIOS[sibling].idioma === 'en' ? 'inglês' : 'português'})`
    : 'Este cenário não tem versão equivalente no outro idioma.';
}

function startScenario() {
  recognitionSession?.abort();
  recognitionSession = null;
  const config = getScenario($('#scenario').value);
  idioma = config.idioma;
  state = createSimulationState(config);
  sessionId = crypto.randomUUID();
  processedPttSessions.clear();
  evaluations = [];
  $('#transcript').innerHTML = '<div class="empty"><span>⌁</span><strong>Frequência livre</strong><p>Use uma sugestão ou pressione o PTT para iniciar.</p></div>';
  $('#evidence').className = 'evidence-empty';
  $('#evidence').innerHTML = '<span>◎</span><p>As fontes da última resposta aparecerão aqui.</p>';
  renderModelStatus(null); renderState(); renderScore(); renderChannel(CHANNEL_STATES.LIVRE); renderLanguage();
}

function renderState() {
  $('#strip-call-sign').textContent = state.aeronave.indicativo;
  $('#strip-phase').textContent = state.fase.toUpperCase();
  $('#strip-runway').textContent = state.cenario.pista_em_uso;
  $('#strip-qnh').textContent = state.cenario.qnh;
  $('#frequency').textContent = state.frequencia.toUpperCase();
}

function addMessage(origin, text, error = false) {
  $('.empty')?.remove();
  const article = document.createElement('article');
  article.className = `message ${origin} ${error ? 'error' : ''}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  article.innerHTML = `<header><span>${origin === 'atco' ? 'CONTROLADOR' : 'PILOTO'}</span><time>${time}Z</time></header><p></p>`;
  article.querySelector('p').textContent = text;
  $('#transcript').append(article);
  $('#transcript').scrollTop = $('#transcript').scrollHeight;
}

function renderEvidence(result) {
  $('#evidence').className = '';
  $('#evidence').innerHTML = result ? `<article class="source-card"><small>${result.id}</small><strong>${result.documento} · ${result.artigo}</strong><p></p></article>` : '<div class="evidence-empty"><span>⊘</span><p>Nenhuma evidência documental encontrada.</p></div>';
  if (result) $('#evidence p').textContent = result.texto;
}

function renderScore() {
  const report = buildSessionReport(state?.historico ?? [], evaluations);
  $('#score').textContent = report.score;
  $('#score-bar').style.width = `${report.score}%`;
  $('#score-detail').textContent = evaluations.length ? `${evaluations.length} cotejamento(s) · ${Object.keys(report.erros_recorrentes).length} tipo(s) de omissão` : 'Nenhum cotejamento avaliado.';
}

/**
 * Fonia da resposta (F7). É falada **toda** fala do controlador, com ou sem cobertura documental:
 * pedido de esclarecimento e recusa são fala como qualquer outra. O canal volta a `livre` quando o
 * áudio termina (ou falha) — não quando o texto aparece.
 */
function speakReply(reply, diagnostics = null) {
  if (!shouldSpeak(reply) || !voiceEnabled) {
    if (diagnosticMode && reply && !shouldSpeak(reply)) window.__ATC_DEBUG__.push({ sessionId, stage: 'tts', skipped: silenceReason(reply) });
    channel.dispatch({ type: 'speechEnd' });
    return null;
  }
  speechPending = true;
  channel.dispatch({ type: 'speechStart' });
  const finish = () => { speechPending = false; channel.dispatch({ type: 'speechEnd' }); };
  try {
    const ttsStartedAt = performance.now();
    const utterance = speakTransmission(reply.spokenText, { idioma, onEnd: finish, onError: finish });
    if (diagnostics) {
      diagnostics.ttsVoice = utterance.voice?.name ?? null;
      diagnostics.ttsStartTimeMs = Math.round((performance.now() - ttsStartedAt) * 100) / 100;
    }
    return utterance;
  } catch (error) {
    finish();
    if (diagnosticMode) window.__ATC_DEBUG__.push({ sessionId, stage: 'tts', errorCode: 'tts_unavailable', message: error.message });
    return null;
  }
}

async function transmit(rawText, { pttSessionId = null, sttCompletionMs = null, audioMeta = null, sttMeta = null, totalStartedAt = null } = {}) {
  if (!search || !rawText.trim() || transmissionInFlight) return;
  if (pttSessionId && processedPttSessions.has(pttSessionId)) return;
  if (pttSessionId) processedPttSessions.add(pttSessionId);
  transmissionInFlight = true;
  try {
  const text = normalizePhraseology(rawText);
  const sessionContext = trimSessionContext(limitedSessionContext(state), DEFAULT_INPUT_BUDGET_TOKENS);
  state = recordTransmission(state, { origem: 'piloto', texto: text });
  addMessage('pilot', text);
  let semantic;
  channel.dispatch({ type: 'stage', stage: 'interpreting' });
  try {
    semantic = await requestSemanticInterpretation({
      rawTranscript: rawText, normalizedTranscript: text,
      language: idioma, sessionContext,
      preferredModelId: preferredModelId || undefined,
      scenarioContext: { airport: state.cenario.aerodromo, runway: state.cenario.pista_em_uso, qnh: state.cenario.qnh, phase: state.fase },
    });
  } catch (error) {
    semantic = { error: error.code ?? 'llm_unavailable' };
  }
  channel.dispatch({ type: 'stage', stage: 'searching' });
  const { decision: reply, diagnostics } = processTransmission({
    text: rawText, idioma, state, search, debug: diagnosticMode,
    interpretation: semantic.pipelineInterpretation,
    semanticMeta: semantic.pipelineInterpretation ? { ...semantic, sessionContextUsed: sessionContext } : { provider: 'deterministic', requestedModel: null, actualModel: null, freeValidated: true, error: semantic.error, sessionContextUsed: sessionContext },
    sessionId, pttSessionId, sttCompletionMs, audioMeta, sttMeta, totalStartedAt,
  });
  channel.dispatch({ type: 'stage', stage: 'responding' });
  if (diagnostics) window.__ATC_DEBUG__.push(diagnostics);
  renderModelStatus(semantic);
  // Cotejamento avaliado UMA vez, pelo controlador, contra a autorização pendente (F2). A UI não
  // reavalia mais por substring a cada turno: a pontuação reflete a decisão, não outra heurística.
  if (reply.readbackAssessment) evaluations.push(reply.readbackAssessment);
  if (!reply.covered) {
    // A resposta sem cobertura também pode alterar o estado (a pergunta pendente da sessão, §4/§5).
    // Descartar a atualização aqui fazia o navegador perder a memória que o pipeline registrou.
    if (reply.stateUpdate) state = applyStateUpdate(state, reply.stateUpdate);
    state = recordTransmission(state, { origem: 'atco', texto: reply.spokenText, fontes: reply.sourceIds });
    addMessage('atco', reply.spokenText, ['coverage_insufficient', 'external_source_unavailable'].includes(reply.status));
    renderEvidence(null); renderState(); renderScore();
    speakReply(reply, diagnostics);
    return;
  }
  if (reply.stateUpdate) state = applyStateUpdate(state, reply.stateUpdate);
  state = recordTransmission(state, { origem: 'atco', texto: reply.spokenText, fontes: reply.sourceIds });
  addMessage('atco', reply.spokenText); renderEvidence(reply.source); renderState(); renderScore();
  speakReply(reply, diagnostics);
  } finally {
    transmissionInFlight = false;
  }
}

/** Livre somente quando nada está em voo: fim de captura sem transmissão também libera o canal. */
function settleChannel() {
  if (!speechPending && !transmissionInFlight) channel.dispatch({ type: 'speechEnd' });
}

function bindReleaseCapture() {
  window.addEventListener('pointerup', onPointerRelease);
  window.addEventListener('pointercancel', onPointerRelease);
  // Rede de segurança: soltar **fora** da janela não gera `pointerup` na `window` (M2). O
  // `pointerleave` do botão que existia antes cobria esse caso, mas também encerrava a captura
  // quando o cursor apenas saía do botão com o PTT pressionado — o oposto de "apertar, segurar e
  // soltar em qualquer lugar da tela", que é o requisito do F4.
  window.addEventListener('blur', onPointerRelease);
}

function unbindReleaseCapture() {
  window.removeEventListener('pointerup', onPointerRelease);
  window.removeEventListener('pointercancel', onPointerRelease);
  window.removeEventListener('blur', onPointerRelease);
}

function onPointerRelease(event) {
  event.preventDefault?.();
  stopPtt();
}

function startPtt() {
  if (!speechRecognitionSupported || !channel.canTransmit || pttOperation || recognitionSession || transmissionInFlight) return;
  const button = $('#ptt');
  try {
    const pttSessionId = crypto.randomUUID();
    let webSpeechTranscript = '';
    let webSpeechResolve;
    const webSpeechDone = new Promise((resolve) => { webSpeechResolve = resolve; });
    const capture = createAudioCaptureSession({ onState: (stateName) => { if (stateName === 'recording') { channel.dispatch({ type: 'stage', stage: 'recording' }); if (diagnosticMode) window.__ATC_DEBUG__.push({ sessionId, pttSessionId, stage: 'recording' }); } } });
    capture.done.catch(() => {});
    const session = createRecognitionSession({
      idioma, sessionId: pttSessionId,
      onInterim: (text, meta) => { if (recognitionSession?.id === meta.sessionId) $('#transmission').value = text; },
      onFinal: (text, meta) => { if (recognitionSession?.id === meta.sessionId) { webSpeechTranscript = text; $('#transmission').value = text; } },
      onError: (event) => { if (event?.error !== 'aborted') webSpeechResolve({ transcript: '', error: 'stt_error' }); },
      onEnd: (meta) => { webSpeechResolve({ transcript: webSpeechTranscript, latencyMs: meta.sttCompletionMs }); if (recognitionSession?.id === meta.sessionId) recognitionSession = null; },
    });
    recognitionSession = session;
    pttOperation = { id: pttSessionId, capture, webSpeechDone, startedAt: performance.now(), stopping: false };
    button.classList.add('listening');
    channel.dispatch({ type: 'press' });
    // Apertar, segurar e soltar em qualquer lugar da tela encerra a captura: os eventos de soltura
    // são escutados na window apenas enquanto existe operação ativa (F4).
    bindReleaseCapture();
    capture.start();
    recognitionSession.start();
  } catch (error) {
    recognitionSession = null; pttOperation = null;
    button.classList.remove('listening');
    channel.dispatch({ type: 'speechEnd' });
    addMessage('atco', error.message, true);
  }
}

function stopPtt() {
  const operation = pttOperation;
  if (!operation || operation.stopping) return;
  operation.stopping = true;
  const button = $('#ptt');
  channel.dispatch({ type: 'stage', stage: 'transcribing' });
  recognitionSession?.stop(); operation.capture.stop();
  Promise.allSettled([operation.capture.done, operation.webSpeechDone]).then(async ([audioResult, speechResult]) => {
    if (pttOperation?.id !== operation.id) return;
    try {
      if (audioResult.status !== 'fulfilled') throw audioResult.reason;
      const audioMeta = audioResult.value;
      const web = speechResult.status === 'fulfilled' ? speechResult.value : {};
      const sttMeta = await transcribeAudioFree({ blob: audioMeta.blob, language: idioma, durationMs: audioMeta.durationMs, webSpeechTranscript: web.transcript, timings: { webSpeechLatencyMs: web.latencyMs } });
      if (pttOperation?.id !== operation.id) return;
      $('#transmission').value = sttMeta.transcript;
      channel.dispatch({ type: 'stage', stage: 'interpreting' });
      await transmit(sttMeta.transcript, { pttSessionId: operation.id, sttCompletionMs: sttMeta.latencyMs, audioMeta, sttMeta, totalStartedAt: operation.startedAt });
    } catch (error) {
      if (diagnosticMode) window.__ATC_DEBUG__.push({ sessionId, pttSessionId: operation.id, stage: 'stt', errorCode: error.code ?? 'stt_error', failures: error.failures ?? [] });
      addMessage('atco', error.code === 'microphone_error' ? 'Permissão de microfone negada.' : 'Nenhum STT gratuito conseguiu transcrever a gravação.', true);
    }
    finally {
      if (pttOperation?.id === operation.id) pttOperation = null;
      button.classList.remove('listening');
      unbindReleaseCapture();
      settleChannel();
    }
  });
}

$('#transmission-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!channel.canTransmit) return;
  const input = $('#transmission');
  transmit(input.value);
  input.value = '';
});
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { $('#transmission').value = button.dataset.prompt; $('#transmission').focus(); }));
$('#scenario').addEventListener('change', startScenario);
$('#language-toggle').addEventListener('click', () => {
  const sibling = languageSibling($('#scenario').value);
  if (!sibling) return;
  $('#scenario').value = sibling;
  startScenario();
});
$('#new-session').addEventListener('click', startScenario);
$('#sound-toggle').addEventListener('click', () => { voiceEnabled = !voiceEnabled; $('#sound-toggle').textContent = voiceEnabled ? '◉ VOZ' : '○ MUDO'; if (!voiceEnabled) { speechPending = false; settleChannel(); } });
$('#ptt').addEventListener('pointerdown', (event) => { event.preventDefault(); startPtt(); });
$('#ptt').addEventListener('click', (event) => { if (event.detail === 0) recognitionSession ? stopPtt() : startPtt(); });

try {
  search = await ManualSearch.load(new URL('../atc-simulator-index.json', import.meta.url));
  renderModelSelect();
  bindModelSelect();
  renderSpeechSupport();
  $('#system-status').classList.add('ready'); $('#system-status').innerHTML = '<span></span> ÍNDICE ONLINE · 374 TRECHOS';
  startScenario();
} catch (error) {
  $('#system-status').textContent = `Falha: ${error.message}`;
}
