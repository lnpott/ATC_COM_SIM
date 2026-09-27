import assert from 'node:assert/strict'
import test from 'node:test'
import { createAiSdkProvider, AI_SDK_DEFAULT_MODEL } from '../server/ai-sdk-provider.js'
import { runProvider } from '../server/providers.js'
import { assertZeroCostRequest, isProviderAllowed, PaidProviderBlockedError } from '../server/cost-policy.js'

const blockedEnv = { ZERO_COST_MODE: 'true', ALLOW_PAID_API: 'false', OPENAI_API_KEY: 'sk-test' }
const optInEnv = { ZERO_COST_MODE: 'false', ALLOW_PAID_API: 'true', OPENAI_API_KEY: 'sk-test' }

function fakeFetchCapture(captures) {
  return async (input, init) => {
    captures.push({ url: String(input), init })
    return new Response(JSON.stringify({
      id: 'chatcmpl-test', object: 'chat.completion', created: 1, model: 'gpt-4o-mini',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Transmissão recebida (demo).' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

test('política bloqueia ai-sdk enquanto zero-cost estiver ativo', () => {
  assert.throws(
    () => assertZeroCostRequest({ provider: 'ai-sdk', model: 'gpt-4o-mini', env: blockedEnv }),
    PaidProviderBlockedError,
  )
  assert.equal(isProviderAllowed('ai-sdk', 'gpt-4o-mini', blockedEnv), false)
  // Opt-in explícito libera o provider quando o modo pago está ativado.
  assert.equal(isProviderAllowed('ai-sdk', 'gpt-4o-mini', { ...optInEnv, AI_PROVIDER: 'ai-sdk' }), true)
})

test('provider ai-sdk recusa execução sem opt-in, mesmo com chave configurada', async () => {
  const captures = []
  const provider = createAiSdkProvider({ env: blockedEnv, fetchImpl: fakeFetchCapture(captures) })
  await assert.rejects(provider.generate([{ role: 'user', content: 'Teste' }], {}), /zero-cost/)
  assert.equal(captures.length, 0)
})

test('provider ai-sdk exige OPENAI_API_KEY quando liberado pela política', async () => {
  const provider = createAiSdkProvider({ env: { ...optInEnv, OPENAI_API_KEY: '' }, fetchImpl: fakeFetchCapture([]) })
  await assert.rejects(provider.generate([{ role: 'user', content: 'Teste' }], {}), /OPENAI_API_KEY/)
})

test('provider ai-sdk chama a API via AI SDK e devolve o texto do controlador', async () => {
  const captures = []
  const provider = createAiSdkProvider({ env: { ...optInEnv, AI_PROVIDER: 'ai-sdk' }, fetchImpl: fakeFetchCapture(captures) })
  const result = await provider.generate(
    [
      { role: 'user', content: 'Torre, PR-ABC, taxi' },
      { role: 'assistant', content: 'PR-ABC, autorizado taxi.' },
      { role: 'user', content: 'PR-ABC, pronto para decolar' },
    ],
    { language: 'pt-BR' },
  )
  assert.equal(result.reply, 'Transmissão recebida (demo).')
  assert.equal(typeof result.latencyMs, 'number')
  assert.equal(captures.length, 1)
  assert.match(captures[0].url, /\/chat\/completions$/)
  const body = JSON.parse(captures[0].init.body)
  assert.equal(body.model, 'gpt-4o-mini')
  assert.equal(body.messages[0].role, 'system')
  assert.match(body.messages[0].content, /controlador/)
  assert.match(body.messages.at(-1).content, /PR-ABC, pronto para decolar/)
})

test('runProvider roteia AI_PROVIDER=ai-sdk e mantém mock como padrão auto-free', async () => {
  const mocked = await runProvider([{ role: 'user', content: 'Teste' }], { language: 'pt-BR' }, {})
  assert.match(mocked, /Transmissão recebida/)

  // O erro de chave ausente vem do provider ai-sdk, provando o roteamento sem rede.
  await assert.rejects(
    runProvider([{ role: 'user', content: 'Teste' }], {}, { ...optInEnv, AI_PROVIDER: 'ai-sdk', OPENAI_API_KEY: '' }),
    /OPENAI_API_KEY/,
  )
})

test('modelo padrão do AI SDK é definido', () => {
  assert.equal(AI_SDK_DEFAULT_MODEL, 'gpt-4o-mini')
})
