import { GoogleGenAI } from '@google/genai'
import { INTERPRETATION_SCHEMA } from './schemas.js'
import { LlmProviderError, withTimeout } from './provider.js'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'

export function createGeminiProvider({ apiKey, model = DEFAULT_GEMINI_MODEL, timeoutMs = 8_000, client } = {}) {
  if (!apiKey && !client) throw new LlmProviderError('configuration', 'GEMINI_API_KEY não configurada.')
  const ai = client ?? new GoogleGenAI({ apiKey })
  return {
    name: 'gemini', model,
    async interpret({ systemInstruction, payload }) {
      const startedAt = performance.now()
      for (let attempt = 1; attempt <= 3; attempt += 1) try {
        const response = await withTimeout((abortSignal) => ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
          config: {
            systemInstruction,
            responseMimeType: 'application/json', responseJsonSchema: INTERPRETATION_SCHEMA,
            temperature: 0.1, maxOutputTokens: 1800,
            thinkingConfig: { thinkingBudget: 0 }, abortSignal,
          },
        }), timeoutMs)
        if (!response?.text) throw new LlmProviderError('empty', 'Gemini retornou resposta vazia.')
        let value
        try { value = JSON.parse(response.text) } catch (cause) { throw new LlmProviderError('invalid_json', 'Gemini retornou JSON inválido.', cause) }
        return { value, latencyMs: Math.round(performance.now() - startedAt) }
      } catch (cause) {
        if (cause instanceof LlmProviderError) throw cause
        const status = cause?.status ?? cause?.response?.status
        const code = status === 429 ? 'quota' : status >= 500 ? 'upstream' : status >= 400 ? 'request' : 'unavailable'
        if (code === 'upstream' && attempt < 3) { await new Promise((resolve) => setTimeout(resolve, attempt * 250)); continue }
        throw new LlmProviderError(code, `Gemini indisponível (${code}).`, cause)
      }
      throw new LlmProviderError('unavailable', 'Gemini indisponível.')
    },
  }
}
