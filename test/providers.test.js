import assert from 'node:assert/strict'
import test from 'node:test'
import { runProvider } from '../server/providers.js'

test('provedor mock funciona sem segredos e respeita o idioma', async () => {
  const portuguese = await runProvider([{ role: 'user', content: 'Teste' }], { language: 'pt-BR' }, {})
  const english = await runProvider([{ role: 'user', content: 'Test' }], { language: 'en-US' }, {})

  assert.match(portuguese, /Transmissão recebida/)
  assert.match(english, /Transmission received/)
})

test('Voice Lab não chama provider pago ou free tier não verificado', async () => {
  await assert.rejects(
    runProvider([{ role: 'user', content: 'Teste' }], {}, { LLM_PROVIDER: 'groq', GROQ_API_KEY: 'test', GROQ_MODEL: 'openai/gpt-oss-20b', ZERO_COST_MODE: 'true', ALLOW_PAID_API: 'false', GROQ_FREE_TIER_CONFIRMED: 'false' }),
    /Free tier não confirmado/,
  )
  await assert.rejects(
    runProvider([{ role: 'user', content: 'Teste' }], {}, { LLM_PROVIDER: 'desconhecido' }),
    /desconhecido/,
  )
})
