import assert from 'node:assert/strict'
import test from 'node:test'
import { assertZeroCostRequest, isProviderAllowed, PaidModelBlockedError, PaidProviderBlockedError, UnverifiedFreeTierError } from '../server/cost-policy.js'

const base = { ZERO_COST_MODE: 'true', ALLOW_PAID_API: 'false', OPENROUTER_FREE_ONLY: 'true', GROQ_FREE_TIER_CONFIRMED: 'false' }

test('política bloqueia providers/modelos pagos antes da rede', () => {
  assert.throws(() => assertZeroCostRequest({ provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash', env: base }), PaidModelBlockedError)
  assert.throws(() => assertZeroCostRequest({ provider: 'openrouter', model: 'qwen/qwen3.8-27b', env: base }), PaidModelBlockedError)
  assert.throws(() => assertZeroCostRequest({ provider: 'groq', model: 'openai/gpt-oss-20b', env: base }), UnverifiedFreeTierError)
  assert.throws(() => assertZeroCostRequest({ provider: 'gemini', model: 'gemini-3.8-flash', env: base }), PaidProviderBlockedError)
})

test('política permite apenas OpenRouter explicitamente free e recursos locais', () => {
  assert.equal(isProviderAllowed('openrouter', 'qwen/qwen3.8-27b:free', base), true)
  assert.equal(isProviderAllowed('openrouter', 'openrouter/free', base), true)
  assert.equal(isProviderAllowed('local', 'whisper-tiny', base), true)
  assert.equal(isProviderAllowed('browser', 'web-speech-api', base), true)
})

test('ALLOW_PAID_API=true contraditório é bloqueado enquanto zero-cost está ativo', () => {
  assert.throws(() => assertZeroCostRequest({ provider: 'openrouter', model: 'openrouter/free', env: { ...base, ALLOW_PAID_API: 'true' } }), PaidProviderBlockedError)
})
