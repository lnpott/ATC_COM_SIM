import { createOpenRouterProvider } from './openrouter-provider.js'
import { configuredCandidates } from '../../server/model-registry.js'
import { costPolicy, isProviderAllowed } from '../../server/cost-policy.js'
import { LlmProviderError } from './provider.js'

export function createAutoFreeProvider({ env = process.env, fetchImpl = fetch, timeoutMs = 8_000 } = {}) {
  const policy = costPolicy(env)
  const candidates = configuredCandidates(env).filter(({ provider, id }) => {
    if (provider === 'groq') return Boolean(env.GROQ_API_KEY) && policy.groqFreeTierConfirmed && isProviderAllowed(provider, id, env)
    return provider === 'openrouter' && Boolean(env.OPENROUTER_API_KEY) && isProviderAllowed(provider, id, env)
  })
  return {
    name: 'auto-free', model: null,
    async interpret(input) {
      const failures = []
      for (let fallbackDepth = 0; fallbackDepth < candidates.length; fallbackDepth += 1) {
        const candidate = candidates[fallbackDepth]
        try {
          // Groq remains absent until its account tier is independently confirmed.
          if (candidate.provider !== 'openrouter') continue
          const provider = createOpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY, model: candidate.id, timeoutMs, fetchImpl, env })
          const result = await provider.interpret(input)
          return { ...result, provider: candidate.provider, fallbackDepth }
        } catch (error) {
          failures.push({ provider: candidate.provider, model: candidate.id, code: error?.code || 'provider_error' })
        }
      }
      throw new LlmProviderError('free_providers_exhausted', 'Todos os provedores LLM gratuitos estão indisponíveis.', failures)
    },
  }
}
