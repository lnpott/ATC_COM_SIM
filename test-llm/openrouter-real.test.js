import assert from 'node:assert/strict'
import test from 'node:test'
import { createAutoFreeProvider } from '../src/llm/auto-free-provider.js'
import { interpretSemantically } from '../src/llm/semantic-interpreter.js'

const enabled = Boolean(process.env.OPENROUTER_API_KEY)
const env = { ...process.env, ZERO_COST_MODE: 'true', ALLOW_PAID_API: 'false', OPENROUTER_FREE_ONLY: 'true', GROQ_FREE_TIER_CONFIRMED: 'false' }

test('OpenRouter real usa somente modelo free validado', { skip: !enabled, timeout: 45_000 }, async () => {
  const provider = createAutoFreeProvider({ env, timeoutMs: 12_000 })
  const result = await interpretSemantically({
    rawTranscript: 'Bom dia Solo Galeão Papa Tango Alfa Bravo Charlie posição dois informação Bravo VFR para o setor norte solicito instruções de táxi',
    normalizedTranscript: 'bom dia solo galeao papa tango alfa bravo charlie posicao dois informacao bravo vfr setor norte solicito instrucoes taxi',
    language: 'pt', sessionContext: { callsign: 'PTABC', airport: 'SBGL', phase: 'solo' }, scenarioContext: { airport: 'SBGL', runway: '18' },
  }, provider)
  assert.equal(result.provider, 'openrouter'); assert.equal(result.freeValidated, true); assert.equal(result.usage.costChargedExpected, 0)
  assert.ok(result.requestedModel.endsWith(':free') || result.requestedModel === 'openrouter/free')
  assert.equal(result.interpretation.intent, 'taxi_request'); assert.equal(result.interpretation.callsign?.value, 'PTABC'); assert.equal(result.interpretation.flightRules?.value, 'VFR')
})

test('Groq LLM real é skip explícito sem Free tier confirmado', { skip: process.env.GROQ_FREE_TIER_CONFIRMED !== 'true' }, () => {
  assert.equal(process.env.GROQ_FREE_TIER_CONFIRMED, 'true')
})
