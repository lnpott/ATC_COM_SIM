import assert from 'node:assert/strict'
import test from 'node:test'
import { runProvider } from '../server/providers.js'

test('provedor mock funciona sem segredos e respeita o idioma', async () => {
  const portuguese = await runProvider([{ role: 'user', content: 'Teste' }], { language: 'pt-BR' }, {})
  const english = await runProvider([{ role: 'user', content: 'Test' }], { language: 'en-US' }, {})

  assert.match(portuguese, /Transmissão recebida/)
  assert.match(english, /Transmission received/)
})

test('provedores remotos falham explicitamente quando a configuração está incompleta', async () => {
  await assert.rejects(
    runProvider([{ role: 'user', content: 'Teste' }], {}, { LLM_PROVIDER: 'gemini' }),
    /GEMINI_API_KEY e GEMINI_MODEL/,
  )
  await assert.rejects(
    runProvider([{ role: 'user', content: 'Teste' }], {}, { LLM_PROVIDER: 'desconhecido' }),
    /desconhecido/,
  )
})
