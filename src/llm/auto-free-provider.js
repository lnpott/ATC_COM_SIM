import { contextLengthFrom, createOpenRouterProvider, freeModelMetadata } from './openrouter-provider.js'
import { configuredCandidates } from '../../server/model-registry.js'
import { costPolicy, isProviderAllowed } from '../../server/cost-policy.js'
import { LlmProviderError } from './provider.js'
import { validateInterpretation } from './schemas.js'
import { payloadFits, resolveBudget, trimPayload } from './context-budget.js'

/**
 * Ordena os candidatos pela preferência do usuário **sem desativar o fallback**: o preferido vai
 * para a frente e os demais permanecem na ordem configurada, de modo que uma falha dele ainda
 * encontra o próximo modelo gratuito (F5).
 */
export function orderCandidates(candidates, preferredModelId) {
  if (!preferredModelId) return [...candidates]
  const preferred = candidates.filter(({ id }) => id === preferredModelId)
  if (!preferred.length) return [...candidates]
  return [...preferred, ...candidates.filter(({ id }) => id !== preferredModelId)]
}

function candidatesFor(env) {
  const policy = costPolicy(env)
  return configuredCandidates(env).filter(({ provider, id }) => {
    if (provider === 'groq') return Boolean(env.GROQ_API_KEY) && policy.groqFreeTierConfirmed && isProviderAllowed(provider, id, env)
    return provider === 'openrouter' && Boolean(env.OPENROUTER_API_KEY) && isProviderAllowed(provider, id, env)
  })
}

export function createAutoFreeProvider({ env = process.env, fetchImpl = fetch, timeoutMs = 15_000, preferredModelId = null } = {}) {
  const candidates = orderCandidates(candidatesFor(env), preferredModelId)
  return {
    name: 'auto-free', model: null, preferredModelId,
    candidates: candidates.map(({ provider, id }) => ({ provider, id })),
    async interpret(input) {
      const failures = []
      for (let fallbackDepth = 0; fallbackDepth < candidates.length; fallbackDepth += 1) {
        const candidate = candidates[fallbackDepth]
        try {
          // Groq remains absent until its account tier is independently confirmed.
          if (candidate.provider !== 'openrouter') continue
          // Orçamento do candidato que está prestes a ser tentado (F6): vem da janela real do
          // catálogo público (`context_length`), descontada a reserva de resposta. O histórico é
          // cortado para caber; se nem o mínimo couber, o candidato é pulado sem chamada de rede.
          // Metadado ausente ou catálogo indisponível NÃO vira estimativa: cai no teto conservador.
          const metadata = await freeModelMetadata(candidate.id, { fetchImpl }).catch(() => null)
          const { budget, source } = resolveBudget({ provider: candidate.provider, model: candidate.id, contextLength: contextLengthFrom(metadata), env })
          const fitted = trimPayload(input.payload, budget)
          if (!payloadFits(fitted.payload, budget)) {
            throw new LlmProviderError('context_budget_exceeded', `Orçamento de contexto excedido para ${candidate.id} (${fitted.estimatedTokens} > ${budget} tokens).`)
          }
          const provider = createOpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY, model: candidate.id, timeoutMs, fetchImpl, env })
          const result = await provider.interpret({ ...input, payload: fitted.payload })
          return {
            ...result,
            value: validateInterpretation(result.value),
            provider: candidate.provider,
            fallbackDepth,
            contextBudget: {
              budget, source, estimatedTokens: fitted.estimatedTokens, trimmed: fitted.trimmed,
              historyBefore: fitted.historyBefore ?? null, historyAfter: fitted.historyAfter ?? null,
            },
          }
        } catch (error) {
          failures.push({ provider: candidate.provider, model: candidate.id, code: error?.code || 'provider_error' })
        }
      }
      const codes = failures.map(({ code }) => code)
      const code = codes.length && codes.every((item) => ['quota', 'timeout'].includes(item))
        ? (codes.includes('quota') ? 'llm_free_quota' : 'llm_timeout')
        : codes.length && codes.every((item) => item === 'context_budget_exceeded') ? 'llm_context_budget_exceeded'
          : 'llm_provider_error'
      throw new LlmProviderError(code, 'Todos os provedores LLM gratuitos estão indisponíveis.', failures)
    },
  }
}
