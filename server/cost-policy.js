export class PaidProviderBlockedError extends Error { constructor(provider) { super(`Provider bloqueado pela política zero-cost: ${provider}`); this.name = 'PaidProviderBlockedError'; this.code = 'paid_provider_blocked' } }
export class PaidModelBlockedError extends Error { constructor(model) { super(`Modelo bloqueado pela política zero-cost: ${model}`); this.name = 'PaidModelBlockedError'; this.code = 'paid_model_blocked' } }
export class UnverifiedFreeTierError extends Error { constructor(provider) { super(`Free tier não confirmado: ${provider}`); this.name = 'UnverifiedFreeTierError'; this.code = 'unverified_free_tier' } }

export function costPolicy(env = process.env) {
  return Object.freeze({
    zeroCostMode: String(env.ZERO_COST_MODE ?? 'true').toLowerCase() === 'true',
    allowPaidApi: String(env.ALLOW_PAID_API ?? 'false').toLowerCase() === 'true',
    groqFreeTierConfirmed: String(env.GROQ_FREE_TIER_CONFIRMED ?? 'false').toLowerCase() === 'true',
    openRouterFreeOnly: String(env.OPENROUTER_FREE_ONLY ?? 'true').toLowerCase() === 'true',
  })
}

export function isModelExplicitlyFree(provider, model) {
  if (provider === 'openrouter') return model === 'openrouter/free' || model.endsWith(':free')
  return provider === 'local' || provider === 'browser' || provider === 'deterministic'
}

export function isProviderAllowed(provider, model, env = process.env) {
  try { assertZeroCostRequest({ provider, model, env }); return true } catch { return false }
}

export function isModelAllowed(provider, model, env = process.env) { return isProviderAllowed(provider, model, env) }

export function assertZeroCostRequest({ provider, model, env = process.env }) {
  const policy = costPolicy(env)
  if (!policy.zeroCostMode) {
    if (!policy.allowPaidApi) throw new PaidProviderBlockedError(provider)
    return policy
  }
  if (policy.allowPaidApi) throw new PaidProviderBlockedError(provider)
  if (provider === 'groq') {
    if (!policy.groqFreeTierConfirmed) throw new UnverifiedFreeTierError(provider)
    return policy
  }
  if (provider === 'openrouter') {
    if (!policy.openRouterFreeOnly || !isModelExplicitlyFree(provider, model)) throw new PaidModelBlockedError(model)
    return policy
  }
  if (!['local', 'browser', 'deterministic'].includes(provider)) throw new PaidProviderBlockedError(provider)
  return policy
}
