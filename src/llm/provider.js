export class LlmProviderError extends Error {
  constructor(code, message, cause) { super(message, { cause }); this.name = 'LlmProviderError'; this.code = code }
}

export function withTimeout(promiseFactory, timeoutMs = 8_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  return Promise.resolve().then(() => promiseFactory(controller.signal)).catch((cause) => {
    if (controller.signal.aborted) throw new LlmProviderError('timeout', 'O interpretador semântico excedeu o tempo limite.', cause)
    throw cause
  }).finally(() => clearTimeout(timer))
}
