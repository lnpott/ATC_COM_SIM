import { INTERPRETATION_SCHEMA } from './schemas.js'
import { LlmProviderError, withTimeout } from './provider.js'
import { assertZeroCostRequest, PaidModelBlockedError } from '../../server/cost-policy.js'

const MODEL_CATALOG_URL = 'https://openrouter.ai/api/v1/models'
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'
let catalogCache = null

async function loadCatalog(fetchImpl, signal) {
  if (!catalogCache || Date.now() - catalogCache.at > 10 * 60_000) {
    const response = await fetchImpl(MODEL_CATALOG_URL, { signal })
    if (!response.ok) throw new LlmProviderError('free_validation_unavailable', 'Não foi possível validar o catálogo gratuito do OpenRouter.')
    catalogCache = { at: Date.now(), models: (await response.json()).data ?? [] }
  }
  return catalogCache.models
}

/**
 * Metadado público do modelo no catálogo (`pricing` e `context_length`), com cache de 10 minutos.
 * É a mesma consulta que a validação gratuita faz — o F6 não gasta chamada extra para descobrir a
 * janela de contexto, e nenhum valor é presumido.
 */
export async function freeModelMetadata(model, { fetchImpl = fetch, signal } = {}) {
  const models = await loadCatalog(fetchImpl, signal)
  return models.find(({ id }) => id === model) ?? null
}

/** Janela de contexto declarada pelo catálogo; `null` quando ausente/zero (não estimar por analogia). */
export function contextLengthFrom(metadata) {
  const value = Number(metadata?.context_length)
  return Number.isFinite(value) && value > 0 ? value : null
}

async function verifyFreeModel(model, fetchImpl, signal) {
  const metadata = await freeModelMetadata(model, { fetchImpl, signal })
  if (!metadata || metadata.pricing?.prompt !== '0' || metadata.pricing?.completion !== '0') throw new PaidModelBlockedError(model)
  return metadata
}

export function clearOpenRouterCatalogCache() { catalogCache = null }

export function createOpenRouterProvider({ apiKey, model, timeoutMs = 8_000, fetchImpl = fetch, env = process.env } = {}) {
  if (!apiKey) throw new LlmProviderError('configuration', 'OPENROUTER_API_KEY não configurada.')
  assertZeroCostRequest({ provider: 'openrouter', model, env })
  return {
    name: 'openrouter', model, freeValidated: false, reasoningMode: 'none',
    async interpret({ systemInstruction, payload }) {
      const startedAt = performance.now()
      return withTimeout(async (signal) => {
        await verifyFreeModel(model, fetchImpl, signal)
        const response = await fetchImpl(CHAT_URL, {
          method: 'POST', signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'ATC COM SIM' },
          body: JSON.stringify({
            model, messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: JSON.stringify(payload) }],
            temperature: 0, max_tokens: 1200, reasoning: { effort: 'none', exclude: true },
            response_format: { type: 'json_schema', json_schema: { name: 'atc_semantic_interpretation', strict: true, schema: INTERPRETATION_SCHEMA } },
          }),
        })
        if (!response.ok) {
          const code = response.status === 429 ? 'quota' : response.status >= 500 ? 'upstream' : 'request'
          throw new LlmProviderError(code, `OpenRouter gratuito indisponível (${code}).`)
        }
        const data = await response.json()
        const text = data.choices?.[0]?.message?.content
        if (!text) throw new LlmProviderError('empty', 'OpenRouter retornou resposta vazia.')
        let value
        try { value = JSON.parse(text) } catch (cause) { throw new LlmProviderError('invalid_json', 'OpenRouter retornou JSON inválido.', cause) }
        if (typeof data.usage?.cost === 'number' && data.usage.cost > 0) { catalogCache = null; throw new PaidModelBlockedError(data.model || model) }
        return {
          value, latencyMs: Math.round(performance.now() - startedAt), requestedModel: model,
          actualModel: data.model || model, freeValidated: true, reasoningMode: 'none',
          usage: { requestCount: 1, promptTokens: data.usage?.prompt_tokens ?? null, completionTokens: data.usage?.completion_tokens ?? null, costChargedExpected: 0 },
        }
      }, timeoutMs)
    },
  }
}
