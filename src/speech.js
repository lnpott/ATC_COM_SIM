import { expandForSpeech } from './normalization.js'

const PHONETIC = {
  A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India',
  J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo',
  S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu',
}

function joinSegments(segments) {
  return [...segments.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, segment]) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** One recognition session corresponds to one PTT press and emits one consolidated final transmission. */
export function createRecognitionSession({ idioma = 'pt', onInterim, onFinal, onError, onEnd, scope = globalThis, sessionId } = {}) {
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition
  if (!Recognition) throw new Error('SpeechRecognition não está disponível neste navegador.')
  if (typeof onFinal !== 'function') throw new TypeError('onFinal deve ser uma função.')

  const recognition = new Recognition()
  recognition.lang = idioma === 'en' || idioma === 'en-US' ? 'en-US' : 'pt-BR'
  recognition.interimResults = true
  recognition.continuous = true
  const segments = new Map()
  let settled = false
  let cancelled = false
  const startedAt = scope.performance?.now?.() ?? Date.now()
  const id = sessionId ?? scope.crypto?.randomUUID?.() ?? `ptt-${Date.now()}-${Math.random().toString(36).slice(2)}`

  recognition.onresult = (event) => {
    const start = Number.isInteger(event.resultIndex) ? event.resultIndex : 0
    for (let index = start; index < event.results.length; index += 1) {
      const result = event.results[index]
      const text = result?.[0]?.transcript?.trim()
      if (text) segments.set(index, { text, final: Boolean(result.isFinal) })
    }
    onInterim?.(joinSegments(segments), {
      sessionId: id,
      final: joinSegments(new Map([...segments].filter(([, segment]) => segment.final))),
      pending: joinSegments(new Map([...segments].filter(([, segment]) => !segment.final))),
    })
  }

  recognition.onerror = (event) => {
    cancelled = true
    if (event?.error !== 'aborted') onError?.(event)
  }

  recognition.onend = () => {
    if (settled) return
    settled = true
    if (!cancelled) {
      const text = joinSegments(segments)
      if (text) onFinal(text, { sessionId: id, sttCompletionMs: Math.round((scope.performance?.now?.() ?? Date.now()) - startedAt) })
    }
    onEnd?.({ sessionId: id, cancelled, transcript: joinSegments(segments), sttCompletionMs: Math.round((scope.performance?.now?.() ?? Date.now()) - startedAt) })
  }

  return {
    id, recognition,
    get transcript() { return joinSegments(segments) },
    start() { recognition.start() },
    stop() { if (!settled) recognition.stop() },
    abort() { cancelled = true; if (!settled) recognition.abort() },
  }
}

/** Backward-compatible single-result adapter. New PTT flows should use createRecognitionSession. */
export function createBrowserRecognizer({ idioma = 'pt', onResult, scope = globalThis } = {}) {
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition
  if (!Recognition) throw new Error('SpeechRecognition não está disponível neste navegador.')
  if (typeof onResult !== 'function') throw new TypeError('onResult deve ser uma função.')
  const recognition = new Recognition()
  recognition.lang = idioma === 'en' ? 'en-US' : 'pt-BR'
  recognition.interimResults = false
  recognition.continuous = false
  recognition.onresult = (event) => {
    const parts = []
    for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
      if (event.results[index].isFinal !== false) parts.push(event.results[index][0].transcript)
    }
    const text = parts.join(' ').replace(/\s+/g, ' ').trim()
    if (text) onResult(text)
  }
  return recognition
}

function voiceScore(voice, locale) {
  const language = voice.lang?.toLowerCase() ?? ''
  const target = locale.toLowerCase()
  const base = target.split('-')[0]
  const name = voice.name?.toLowerCase() ?? ''
  let score = language === target ? 100 : language.startsWith(base) ? 60 : 0
  if (voice.localService) score += 10
  if (voice.default) score += 5
  if (/natural|neural|premium|enhanced/.test(name)) score += 30
  else if (/online|google|microsoft|apple/.test(name)) score += 12
  if (/espeak|compact/.test(name)) score -= 10
  return score
}

export function selectSpeechVoice(voices, idioma = 'pt') {
  const locale = idioma === 'en' || idioma === 'en-US' ? 'en-US' : 'pt-BR'
  return [...(voices ?? [])]
    .filter((voice) => voice?.lang?.toLowerCase().startsWith(locale.slice(0, 2).toLowerCase()))
    .sort((left, right) => voiceScore(right, locale) - voiceScore(left, locale) || left.name.localeCompare(right.name))[0]
}

export function prepareSpeechText(text, idioma = 'pt') {
  const english = idioma === 'en' || idioma === 'en-US'
  const digits = english ? ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'] : ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
  const spell = (value) => [...value].map((character) => digits[Number(character)]).join(' ')
  const phonetic = (value) => [...value].map((letter) => PHONETIC[letter]).join(' ')
  return expandForSpeech(text, english ? 'en' : 'pt')
    .replace(/\b([A-Z]{2})-([A-Z]{3})\b/g, (_, prefix, suffix) => `${phonetic(prefix)} ${phonetic(suffix)}`)
    .replace(/\b([A-Z]{2,3})-(\d{2,4})\b/g, (_, prefix, number) => `${phonetic(prefix)} ${spell(number)}`)
    .replace(/\b(1\d{2})[,.](\d{1,3})\b/g, (_, whole, decimal) => `${spell(whole)} ${english ? 'decimal' : 'vírgula'} ${spell(decimal)}`)
    .replace(/\s+/g, ' ')
    .trim()
}

export function speakTransmission(text, { idioma = 'pt', scope = globalThis, onEnd, onError } = {}) {
  if (!scope.speechSynthesis || !scope.SpeechSynthesisUtterance) throw new Error('speechSynthesis não está disponível neste navegador.')
  const locale = idioma === 'en' || idioma === 'en-US' ? 'en-US' : 'pt-BR'
  const utterance = new scope.SpeechSynthesisUtterance(prepareSpeechText(text, idioma))
  utterance.lang = locale
  utterance.voice = selectSpeechVoice(scope.speechSynthesis.getVoices?.(), idioma) ?? null
  utterance.rate = locale === 'pt-BR' ? 0.9 : 0.92
  utterance.pitch = 0.96
  utterance.volume = 1
  utterance.onend = onEnd
  utterance.onerror = onError
  scope.speechSynthesis.cancel?.()
  scope.speechSynthesis.speak(utterance)
  return utterance
}
