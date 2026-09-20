import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createInterpretTransmissionHandler } from '../server/interpret-transmission.js'

function call(handler, { method = 'POST', contentType = 'application/json', body = '{}' } = {}) {
  const request = new EventEmitter(); request.method = method; request.headers = { 'content-type': contentType }
  const response = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v }, end(value = '') { this.body = value; this.resolve?.() } }
  const done = new Promise((resolve) => { response.resolve = resolve })
  handler(request, response); queueMicrotask(() => { request.emit('data', body); request.emit('end') })
  return done.then(() => ({ ...response, json: JSON.parse(response.body) }))
}

test('endpoint semântico exige POST, JSON e entrada limitada', async () => {
  const handler = createInterpretTransmissionHandler({}, { provider: {} })
  assert.equal((await call(handler, { method: 'GET' })).statusCode, 405)
  assert.equal((await call(handler, { contentType: 'text/plain' })).statusCode, 415)
  assert.equal((await call(handler, { body: JSON.stringify({ rawTranscript: '' }) })).statusCode, 400)
})

test('endpoint retorna structured output sem expor configuração', async () => {
  const value = {
    language: 'pt-BR', understood: false, ambiguous: true, confidence: 0.2,
    station: null, callsign: null, position: null, flightRules: null, atis: null, destinationOrSector: null,
    runway: null, altitude: null, heading: null, frequency: null, phase: 'unknown', intent: 'unknown', intentFamily: 'unknown', requestType: 'unknown', emergency: false, readback: false,
    entities: [], missingOperationalInformation: [], uncertainElements: ['intent'], searchConcepts: ['unknown transmission'], semanticSummary: 'Não compreendida.',
  }
  const provider = { name: 'gemini', model: 'gemini-3.8-flash', async interpret() { return { value, latencyMs: 2 } } }
  const handler = createInterpretTransmissionHandler({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'must-not-leak' }, { provider })
  const result = await call(handler, { body: JSON.stringify({ rawTranscript: 'texto', normalizedTranscript: 'texto', language: 'pt', sessionContext: {}, scenarioContext: {} }) })
  assert.equal(result.statusCode, 200)
  assert.equal(result.json.interpretationMode, 'llm')
  assert.equal(result.json.model, 'gemini-3.8-flash')
  assert.doesNotMatch(result.body, /must-not-leak/)
})
