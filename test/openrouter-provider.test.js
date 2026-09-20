import assert from 'node:assert/strict'
import test from 'node:test'
import { createOpenRouterProvider, clearOpenRouterCatalogCache } from '../src/llm/openrouter-provider.js'
import { PaidModelBlockedError } from '../server/cost-policy.js'

const env = { ZERO_COST_MODE: 'true', ALLOW_PAID_API: 'false', OPENROUTER_FREE_ONLY: 'true' }
const valid = {
  language: 'pt-BR', understood: true, ambiguous: false, confidence: 0.9,
  station: null, callsign: null, position: null, flightRules: null, atis: null, destinationOrSector: null,
  runway: null, altitude: null, heading: null, frequency: null, phase: 'ground', intent: 'taxi_request', intentFamily: 'ground_movement', requestType: 'controller_instruction', emergency: false, readback: false,
  entities: [], missingOperationalInformation: [], uncertainElements: [], searchConcepts: ['taxi'], semanticSummary: 'Solicita táxi.',
}

test('modelo OpenRouter pago é bloqueado antes de qualquer fetch', () => {
  let calls = 0
  assert.throws(() => createOpenRouterProvider({ apiKey: 'test', model: 'qwen/qwen3.8-27b', env, fetchImpl: async () => { calls += 1 } }), PaidModelBlockedError)
  assert.equal(calls, 0)
})

test('modelo :free requer preço zero ao vivo e registra modelo efetivo', async () => {
  clearOpenRouterCatalogCache(); let calls = 0
  const fetchImpl = async (_url, options = {}) => {
    calls += 1
    if (!options.method) return { ok: true, json: async () => ({ data: [{ id: 'qwen/qwen3.8-27b:free', pricing: { prompt: '0', completion: '0' } }] }) }
    const request = JSON.parse(options.body)
    assert.equal(request.model, 'qwen/qwen3.8-27b:free')
    assert.equal(request.temperature, 0)
    assert.equal(request.response_format.json_schema.strict, true)
    return { ok: true, json: async () => ({ model: 'qwen/qwen3.8-27b:free', choices: [{ message: { content: JSON.stringify(valid) } }], usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0 } }) }
  }
  const result = await createOpenRouterProvider({ apiKey: 'test', model: 'qwen/qwen3.8-27b:free', env, fetchImpl }).interpret({ systemInstruction: 'safe', payload: {} })
  assert.equal(calls, 2)
  assert.equal(result.freeValidated, true)
  assert.equal(result.actualModel, 'qwen/qwen3.8-27b:free')
  assert.equal(result.usage.costChargedExpected, 0)
})

test('metadata com preço não-zero bloqueia antes do chat', async () => {
  clearOpenRouterCatalogCache(); let calls = 0
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => ({ data: [{ id: 'qwen/qwen3.8-27b:free', pricing: { prompt: '0.1', completion: '0' } }] }) } }
  const provider = createOpenRouterProvider({ apiKey: 'test', model: 'qwen/qwen3.8-27b:free', env, fetchImpl })
  await assert.rejects(() => provider.interpret({ systemInstruction: '', payload: {} }), PaidModelBlockedError)
  assert.equal(calls, 1)
})
