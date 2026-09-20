import { transcribeLocalAudio } from '../local-asr.js'

async function remote(blob, language, fetchImpl) {
  const form = new FormData(); form.set('audio', blob, `ptt.${blob.type.includes('ogg') ? 'ogg' : 'webm'}`); form.set('language', language === 'en' ? 'en' : 'pt')
  const response = await fetchImpl('/api/transcribe', { method: 'POST', body: form })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data.error || 'stt_error'), { code: data.error || 'stt_error' })
  return data
}

export async function transcribeAudioFree({ blob, language, webSpeechTranscript, fetchImpl = fetch, localTranscriber = transcribeLocalAudio, localEnabled = true, timings = {} }) {
  const failures = []
  try { return { ...(await remote(blob, language, fetchImpl)), fallbackDepth: 0, failures } } catch (error) { failures.push(error.code || 'stt_error') }
  if (localEnabled) try { return { ...(await localTranscriber(blob, { language })), freeValidated: true, fallbackDepth: 1, failures, costChargedExpected: 0 } } catch (error) { failures.push(error.code || 'local_asr_error') }
  if (webSpeechTranscript?.trim()) return { transcript: webSpeechTranscript.trim(), provider: 'browser', model: 'web-speech-api', mode: 'web_speech_fallback', freeValidated: true, fallbackDepth: 2, failures, latencyMs: timings.webSpeechLatencyMs ?? null, costChargedExpected: 0 }
  throw Object.assign(new Error('Nenhum STT gratuito produziu transcrição.'), { code: 'stt_unavailable', failures })
}
