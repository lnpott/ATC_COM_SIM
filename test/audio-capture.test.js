import assert from 'node:assert/strict'
import test from 'node:test'
import { createAudioCaptureSession, selectRecordingMimeType } from '../src/audio-capture.js'
import { transcribeAudioFree } from '../src/services/transcribeAudio.js'

function scope({ denied = false } = {}) {
  const track = { stopped: false, stop() { this.stopped = true } }
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus' }
    constructor(stream, options) { this.stream = stream; this.mimeType = options.mimeType; this.state = 'inactive'; Recorder.instance = this }
    start() { this.state = 'recording' }
    stop() { if (this.state !== 'recording') return; this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) }); this.onstop?.() }
  }
  return { track, Recorder, value: { MediaRecorder: Recorder, Blob, crypto: { randomUUID: () => 'audio-session' }, performance, navigator: { mediaDevices: { getUserMedia: async () => { if (denied) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); return { getTracks: () => [track] } } } } } }
}

test('MediaRecorder escolhe Opus, consolida chunks e finaliza uma vez', async () => {
  const fake = scope(); assert.equal(selectRecordingMimeType(fake.Recorder), 'audio/webm;codecs=opus')
  const session = createAudioCaptureSession({ scope: fake.value }); const starting = session.start(); session.stop(); await starting
  const result = await session.done; session.stop()
  assert.equal(result.id, 'audio-session'); assert.equal(result.mimeType, 'audio/webm;codecs=opus'); assert.equal(result.sizeBytes, 5); assert.equal(fake.track.stopped, true)
})

test('permissão negada produz microphone_error e permite criar sessão seguinte', async () => {
  const denied = createAudioCaptureSession({ scope: scope({ denied: true }).value }); await denied.start(); await assert.rejects(denied.done, { code: 'microphone_error' })
  const retry = createAudioCaptureSession({ scope: scope().value }); await retry.start(); retry.stop(); assert.equal((await retry.done).sizeBytes, 5)
})

test('STT gratuito usa local após servidor bloqueado e Web Speech após falha local', async () => {
  const blob = new Blob(['fixture'], { type: 'audio/webm' })
  const serverUnavailable = async () => ({ ok: false, status: 503, json: async () => ({ error: 'unverified_free_tier' }) })
  const local = async () => ({ transcript: 'fala local', provider: 'local', model: 'whisper-tiny', mode: 'local_wasm', latencyMs: 12 })
  const first = await transcribeAudioFree({ blob, language: 'pt', webSpeechTranscript: 'fala browser', fetchImpl: serverUnavailable, localTranscriber: local })
  assert.equal(first.transcript, 'fala local'); assert.equal(first.fallbackDepth, 1); assert.equal(first.costChargedExpected, 0)
  const second = await transcribeAudioFree({ blob, language: 'pt', webSpeechTranscript: 'fala browser', fetchImpl: serverUnavailable, localTranscriber: async () => { throw Object.assign(new Error(), { code: 'local_asr_error' }) } })
  assert.equal(second.transcript, 'fala browser'); assert.equal(second.mode, 'web_speech_fallback'); assert.equal(second.fallbackDepth, 2)
})
