import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transcribeAudioFree } from '../src/services/transcribeAudio.js'

test('fixture WAV de transmissão longa percorre ASR local controlado sem API paga', async () => {
  const bytes = await readFile(new URL('../test/fixtures/long-taxi-pt.wav', import.meta.url))
  assert.ok(bytes.length > 100_000)
  const blob = new Blob([bytes], { type: 'audio/wav' })
  let localCalls = 0
  const result = await transcribeAudioFree({
    blob, language: 'pt', webSpeechTranscript: '',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ error: 'unverified_free_tier' }) }),
    localTranscriber: async (received) => { localCalls += 1; assert.equal(received.size, bytes.length); return { transcript: 'Bom dia Solo Galeão Papa Tango Alfa Bravo Charlie posição dois informação Bravo VFR setor norte solicito instruções de táxi', provider: 'local', model: 'onnx-community/whisper-tiny', mode: 'local_wasm', latencyMs: 24 } },
  })
  assert.equal(localCalls, 1); assert.equal(result.provider, 'local'); assert.match(result.transcript, /posição dois.*Bravo.*VFR.*norte.*táxi/i); assert.equal(result.costChargedExpected, 0)
})

test('Groq STT permanece skipped sem confirmação explícita do free tier', { skip: process.env.GROQ_FREE_TIER_CONFIRMED !== 'true' }, () => {
  assert.equal(process.env.GROQ_FREE_TIER_CONFIRMED, 'true')
})
