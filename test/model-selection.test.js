/**
 * Seleção de modelo, visibilidade e continuidade (F5/F6 — A3.11, A3.12).
 *
 * O que precisa ficar garantido:
 * - escolher um modelo **prioriza**, nunca desliga o failover (se o preferido falha, o próximo
 *   candidato gratuito responde);
 * - trocar de modelo no meio da sessão não perde cenário/fase/histórico: o contexto é reconstruído
 *   do estado a cada chamada, para qualquer candidato;
 * - candidato cujo orçamento de contexto não comporta o payload é pulado **sem** chamada de rede.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createAutoFreeProvider, orderCandidates } from '../src/llm/auto-free-provider.js'
import { clearOpenRouterCatalogCache } from '../src/llm/openrouter-provider.js'
import { configuredCandidates } from '../server/model-registry.js'
import { DEFAULT_INPUT_BUDGET_TOKENS, RESPONSE_RESERVE_TOKENS, budgetFor, budgetFromContextLength, estimateTokens, payloadFits, resolveBudget, trimPayload, trimSessionContext } from '../src/llm/context-budget.js'
import { limitedSessionContext } from '../src/llm/semantic-interpreter.js'
import { getScenario } from '../src/scenarios.js'
import { applyStateUpdate, createSimulationState, recordTransmission } from '../src/state-machine.js'

const ENV = { OPENROUTER_API_KEY: 'test-key', ZERO_COST_MODE: 'true', ALLOW_PAID_API: 'false', OPENROUTER_FREE_ONLY: 'true' }
/** Candidatos gratuitos reais configurados, na ordem da cascata. */
const CANDIDATES = configuredCandidates(ENV).filter(({ provider }) => provider === 'openrouter').map(({ id }) => id)
const [PRIMARY, SECONDARY] = CANDIDATES

function catalogResponse(ids, contextLength = DEFAULT_CONTEXT_LENGTH) {
  return {
    data: ids.map((id) => ({
      id, pricing: { prompt: '0', completion: '0' },
      ...(contextLength ? { context_length: contextLength } : {}),
    })),
  }
}

/** Janela declarada pelo catálogo público; o orçamento é a janela menos a reserva de resposta. */
const DEFAULT_CONTEXT_LENGTH = 32_768
const EXPECTED_CATALOG_BUDGET = DEFAULT_CONTEXT_LENGTH - RESPONSE_RESERVE_TOKENS

function completionResponse(model, content) {
  return { model, choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }
}

/** Fetch falso: catálogo gratuito completo, um modelo que falha e o restante respondendo. */
function fakeFetch({ failing = null, value = INTERPRETATION, contextLength = DEFAULT_CONTEXT_LENGTH } = {}) {
  // O catálogo é cacheado por 10 minutos no provider; cada servidor falso precisa de cache limpo.
  clearOpenRouterCatalogCache()
  const calls = []
  const impl = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null
    calls.push({ url, model: body?.model ?? null })
    if (url.includes('/models')) return new Response(JSON.stringify(catalogResponse(CANDIDATES, contextLength)), { status: 200 })
    if (failing && body?.model === failing) return new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 503 })
    return new Response(JSON.stringify(completionResponse(body?.model, value)), { status: 200 })
  }
  return { impl, calls }
}

/** Interpretação completa e válida para o schema (validateInterpretation exige todos os campos). */
const INTERPRETATION = {
  language: 'pt-BR', understood: true, ambiguous: false, confidence: 0.9,
  station: { value: 'solo', source: 'explicit', confidence: 0.9, spoken: 'Solo' },
  callsign: { value: 'PTABC', source: 'explicit', confidence: 0.9, spoken: 'Papa Tango Alfa Bravo Charlie' },
  position: null, flightRules: null, atis: null, destinationOrSector: null,
  runway: null, altitude: null, heading: null, frequency: null,
  phase: 'ground', intent: 'taxi_request', intentFamily: 'ground_movement', requestType: 'permission',
  emergency: false, readback: false,
  entities: ['táxi'], missingOperationalInformation: [], uncertainElements: [],
  searchConcepts: ['instruções de táxi'], semanticSummary: 'O piloto solicita instruções de táxi.',
}

test('a preferência reordena os candidatos sem remover ninguém do fallback', () => {
  const candidates = [{ provider: 'openrouter', id: 'a:free' }, { provider: 'openrouter', id: 'b:free' }, { provider: 'openrouter', id: 'c:free' }]
  assert.deepEqual(orderCandidates(candidates, 'c:free').map(({ id }) => id), ['c:free', 'a:free', 'b:free'])
  assert.deepEqual(orderCandidates(candidates, null).map(({ id }) => id), ['a:free', 'b:free', 'c:free'])
  // Preferido que não está configurado não inventa candidato nem quebra a ordem.
  assert.deepEqual(orderCandidates(candidates, 'z:free').map(({ id }) => id), ['a:free', 'b:free', 'c:free'])
})

test('falha do modelo preferido cai no próximo candidato gratuito', async () => {
  // O preferido é o secundário; ele falha e a resposta precisa vir do primeiro da cascata.
  const { impl, calls } = fakeFetch({ failing: SECONDARY })
  const provider = createAutoFreeProvider({ env: ENV, fetchImpl: impl, preferredModelId: SECONDARY })
  const result = await provider.interpret({ systemInstruction: 'sys', payload: { rawTranscript: 'táxi', sessionContext: {} } })

  assert.equal(result.actualModel, PRIMARY, 'a resposta veio do próximo candidato gratuito')
  assert.equal(result.fallbackDepth, 1, 'a resposta veio do segundo candidato tentado')
  assert.equal(calls.find(({ model }) => model)?.model, SECONDARY, 'o preferido foi tentado primeiro')
})

test('trocar de modelo preserva cenário, fase e histórico recente', async () => {
  const scenario = getScenario('vfr_local_pt')
  let state = createSimulationState(scenario)
  state = recordTransmission(state, { origem: 'piloto', texto: 'solicito instruções de táxi' })
  state = applyStateUpdate(state, { fase: 'decolagem', frequencia: 'torre' })

  const payloads = []
  const { impl } = fakeFetch({ failing: SECONDARY })
  const capture = async (url, init) => { if (!url.includes('/models')) payloads.push(JSON.parse(init.body)); return impl(url, init) }

  for (const preferredModelId of [PRIMARY, SECONDARY]) {
    const provider = createAutoFreeProvider({ env: ENV, fetchImpl: capture, preferredModelId })
    await provider.interpret({ systemInstruction: 'sys', payload: { rawTranscript: 'pronto para partida', sessionContext: limitedSessionContext(state) } })
  }

  const contexts = payloads.map(({ messages }) => JSON.parse(messages.at(-1).content).sessionContext)
  for (const context of contexts) {
    assert.equal(context.airport, state.cenario.aerodromo)
    assert.equal(context.phase, 'decolagem')
    assert.equal(context.station, 'torre')
    assert.equal(context.recentHistory.length, 1)
  }
  assert.deepEqual(contexts[0], contexts[1], 'o contexto não depende de qual modelo respondeu')
})

test('orçamento de contexto: corte do histórico, teto conservador e pulo sem chamada de rede', async () => {
  assert.equal(budgetFor('openrouter', 'x:free', {}), DEFAULT_INPUT_BUDGET_TOKENS)
  assert.equal(budgetFor('openrouter', 'x:free', { LLM_CONTEXT_BUDGET_DEFAULT: '1234' }), 1234)
  assert.equal(budgetFor('openrouter', 'x:free', { LLM_CONTEXT_BUDGETS: JSON.stringify({ openrouter: { 'x:free': 999 } }) }), 999)

  // Sem metadado no catálogo o número é desconhecido: teto conservador, nunca o maior conhecido.
  assert.equal(budgetFromContextLength(null), null)
  assert.equal(budgetFromContextLength(0), null)
  assert.deepEqual(resolveBudget({ provider: 'openrouter', model: 'x:free', contextLength: null, env: {} }), { budget: DEFAULT_INPUT_BUDGET_TOKENS, source: 'default', contextLength: null })
  assert.deepEqual(
    resolveBudget({ provider: 'openrouter', model: 'x:free', contextLength: DEFAULT_CONTEXT_LENGTH, env: {} }),
    { budget: EXPECTED_CATALOG_BUDGET, source: 'catalog', contextLength: DEFAULT_CONTEXT_LENGTH },
  )
  // Configuração explícita do operador tem precedência sobre a janela do catálogo.
  assert.equal(resolveBudget({ provider: 'openrouter', model: 'x:free', contextLength: DEFAULT_CONTEXT_LENGTH, env: { LLM_CONTEXT_BUDGET_DEFAULT: '1234' } }).source, 'configured')

  const context = { airport: 'SBGL', phase: 'solo', recentHistory: Array.from({ length: 6 }, (_, index) => ({ origin: 'piloto', text: `transmissão ${index} `.repeat(30) })) }
  const small = trimSessionContext(context, 400)
  assert.ok(small.recentHistory.length < context.recentHistory.length, 'o histórico é cortado até caber')
  assert.equal(small.airport, 'SBGL', 'o contexto do voo é preservado')
  assert.ok(estimateTokens(small) <= 400)
  assert.equal(payloadFits({ rawTranscript: 'táxi', sessionContext: small }, 400), true)
  assert.equal(trimPayload({ rawTranscript: 'táxi', sessionContext: context }, 400).trimmed, true)

  // Nada cabe: o candidato é pulado sem chamada de rede e o motivo é registrado.
  const calls = []
  const provider = createAutoFreeProvider({
    env: { ...ENV, LLM_CONTEXT_BUDGET_DEFAULT: '10' },
    fetchImpl: async (url, init) => { calls.push(url); return new Response('{}', { status: 200 }) },
  })
  await assert.rejects(
    provider.interpret({ systemInstruction: 'sys', payload: { rawTranscript: 'táxi '.repeat(50), sessionContext: {} } }),
    (error) => error.code === 'llm_context_budget_exceeded',
  )
  assert.deepEqual(calls.filter((url) => !url.includes('/models')), [], 'nenhum candidato foi tentado por rede')
})

test('o orçamento de cada candidato vem da janela real do catálogo e é registrado', async () => {
  const { impl } = fakeFetch()
  const provider = createAutoFreeProvider({ env: ENV, fetchImpl: impl })
  const result = await provider.interpret({ systemInstruction: 'sys', payload: { rawTranscript: 'táxi', sessionContext: {} } })

  assert.equal(result.contextBudget.source, 'catalog')
  assert.equal(result.contextBudget.budget, EXPECTED_CATALOG_BUDGET)

  // Catálogo sem `context_length`: o candidato continua elegível, com teto conservador.
  const withoutWindow = fakeFetch({ contextLength: null })
  const fallback = await createAutoFreeProvider({ env: ENV, fetchImpl: withoutWindow.impl })
    .interpret({ systemInstruction: 'sys', payload: { rawTranscript: 'táxi', sessionContext: {} } })
  assert.equal(fallback.contextBudget.source, 'default')
  assert.equal(fallback.contextBudget.budget, DEFAULT_INPUT_BUDGET_TOKENS)
})

test('janela pequena corta o histórico em vez de recusar o candidato', async () => {
  const { impl } = fakeFetch({ contextLength: 3_000 })
  const state = createSimulationState(getScenario('vfr_local_pt'))
  const context = {
    ...limitedSessionContext(state),
    recentHistory: Array.from({ length: 8 }, (_, index) => ({ origin: 'piloto', text: `transmissão ${index} `.repeat(40) })),
  }
  const provider = createAutoFreeProvider({ env: ENV, fetchImpl: impl })
  const result = await provider.interpret({ systemInstruction: 'sys', payload: { rawTranscript: 'táxi', sessionContext: context } })

  assert.equal(result.contextBudget.source, 'catalog')
  assert.equal(result.contextBudget.budget, 3_000 - RESPONSE_RESERVE_TOKENS)
  assert.equal(result.contextBudget.trimmed, true)
  assert.ok(result.contextBudget.historyAfter < result.contextBudget.historyBefore)
})
