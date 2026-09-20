import { createAutoFreeProvider } from '../src/llm/auto-free-provider.js'
import { costPolicy } from './cost-policy.js'
import { interpretSemantically } from '../src/llm/semantic-interpreter.js'

function readBody(request, limit = 12_000) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk; if (body.length > limit) reject(Object.assign(new Error('payload_too_large'), { status: 413 })) })
    request.on('end', () => resolve(body)); request.on('error', reject)
  })
}

function validObject(value) { return value && typeof value === 'object' && !Array.isArray(value) }

export function createInterpretTransmissionHandler(env = process.env, options = {}) {
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    if (request.method !== 'POST') { response.statusCode = 405; response.setHeader('Allow', 'POST'); response.end(JSON.stringify({ error: 'method_not_allowed' })); return }
    if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) { response.statusCode = 415; response.end(JSON.stringify({ error: 'content_type_required' })); return }
    try {
      const body = JSON.parse(await readBody(request) || '{}')
      if (typeof body.rawTranscript !== 'string' || !body.rawTranscript.trim() || body.rawTranscript.length > 2_000 || typeof body.normalizedTranscript !== 'string' || !validObject(body.sessionContext) || !validObject(body.scenarioContext)) { response.statusCode = 400; response.end(JSON.stringify({ error: 'invalid_request' })); return }
      const providerName = (env.LLM_PROVIDER || 'auto-free').toLowerCase()
      if (providerName !== 'auto-free') throw Object.assign(new Error('unsupported_provider'), { code: 'configuration' })
      const policy = costPolicy(env)
      const provider = options.provider ?? createAutoFreeProvider({ env, timeoutMs: Number(env.LLM_TIMEOUT_MS) || 15_000 })
      const result = await interpretSemantically(body, provider)
      response.statusCode = 200
      response.end(JSON.stringify({ ...result, interpretationMode: 'llm', zeroCostMode: policy.zeroCostMode, allowPaidApi: policy.allowPaidApi }))
    } catch (error) {
      response.statusCode = error?.status === 413 ? 413 : error instanceof SyntaxError ? 400 : ({ configuration: 503, quota: 429, timeout: 504, upstream: 503, request: 400, invalid_json: 502, empty: 502, llm_free_quota: 429, llm_timeout: 504, llm_provider_error: 503, paid_provider_blocked: 403, paid_model_blocked: 403, unverified_free_tier: 403 }[error?.code] ?? 502)
      response.end(JSON.stringify({ error: error?.code || (error instanceof SyntaxError ? 'invalid_json' : 'llm_unavailable') }))
    }
  }
}
