export const FREE_LLM_CANDIDATES = Object.freeze([
  Object.freeze({ provider: 'groq', id: 'openai/gpt-oss-20b', structuredOutput: true, schemaEnforcement: 'strict', reasoningMode: 'low', requiresConfirmedTier: true }),
  Object.freeze({ provider: 'groq', id: 'qwen/qwen3.8-27b', structuredOutput: true, schemaEnforcement: 'strict', reasoningMode: 'none', requiresConfirmedTier: true }),
  Object.freeze({ provider: 'openrouter', id: 'qwen/qwen3.8-27b:free', structuredOutput: true, schemaEnforcement: 'provider-and-local', reasoningMode: 'none', requiresLivePricingValidation: true }),
  Object.freeze({ provider: 'openrouter', id: 'google/gemma-4-26b-a4b-it:free', structuredOutput: true, schemaEnforcement: 'response-format-and-local', reasoningMode: 'none', requiresLivePricingValidation: true }),
  Object.freeze({ provider: 'openrouter', id: 'openrouter/free', structuredOutput: true, schemaEnforcement: 'router-and-local', reasoningMode: 'none', requiresLivePricingValidation: true }),
])

export function configuredCandidates(env = process.env) {
  const ids = {
    groq: [env.GROQ_LLM_PRIMARY || 'openai/gpt-oss-20b', env.GROQ_LLM_SECONDARY || 'qwen/qwen3.8-27b'],
    openrouter: [env.OPENROUTER_FREE_PRIMARY || 'qwen/qwen3.8-27b:free', env.OPENROUTER_FREE_SECONDARY || 'google/gemma-4-26b-a4b-it:free', env.OPENROUTER_FREE_ROUTER || 'openrouter/free'],
  }
  return ['groq', 'openrouter'].flatMap((provider) => ids[provider].map((id) => FREE_LLM_CANDIDATES.find((entry) => entry.provider === provider && entry.id === id) ?? Object.freeze({ provider, id, structuredOutput: false, schemaEnforcement: 'local', reasoningMode: 'none' })))
}
