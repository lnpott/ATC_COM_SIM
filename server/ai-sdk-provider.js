import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { assertZeroCostRequest } from './cost-policy.js'

/**
 * Vercel AI SDK provider used exclusively by the voice-loop reply endpoint
 * (`/api/generate-reply`). It is never registered for the semantic
 * interpretation path (`/api/interpret-transmission`), which keeps its own
 * explicit free-only provider chain (see src/llm/auto-free-provider.js).
 *
 * Opt-in and gated: requires AI_PROVIDER=ai-sdk AND ALLOW_PAID_API=true.
 * Zero-cost mode (ZERO_COST_MODE=true) hard-blocks this provider before any
 * network call, following server/cost-policy.js.
 */
export const AI_SDK_DEFAULT_MODEL = 'gpt-4o-mini'

function normalizeHistory(messages = []) {
  return messages
    .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string' && message.content.trim())
    .slice(-12)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 4_000) }))
}

function buildPrompt(messages, context) {
  const language = context?.language === 'en-US' ? 'English (US)' : 'Português (Brasil)'
  const history = messages.map((message) => `${message.role === 'user' ? 'Piloto' : 'Controlador (demo)'}: ${message.content}`).join('\n')
  return `Histórico da conversa:\n${history}\n\nResponda como controlador no idioma: ${language}. Resposta curta, sem autorizações operacionais reais (demonstração).`
}

export function createAiSdkProvider({ env = process.env, fetchImpl = fetch } = {}) {
  return {
    name: 'ai-sdk',
    async generate(messages, context = {}) {
      // Política de custo antes de qualquer leitura de chave ou rede.
      assertZeroCostRequest({ provider: 'ai-sdk', model: env.AI_SDK_MODEL || AI_SDK_DEFAULT_MODEL, env })

      const apiKey = env.OPENAI_API_KEY
      if (!apiKey) throw new Error('OPENAI_API_KEY não configurada para o provider ai-sdk.')

      const openai = createOpenAI({
        apiKey,
        baseURL: env.OPENAI_BASE_URL || undefined,
        fetch: fetchImpl,
      })

      const startedAt = performance.now()
      const { text } = await generateText({
        model: openai.chat(env.AI_SDK_MODEL || AI_SDK_DEFAULT_MODEL),
        system: `Você participa de uma prova de conceito de áudio para um simulador ATC.
Responda como um controlador, de forma breve e no idioma solicitado. Nesta fase não há base
documental nem estado de voo: não emita uma autorização operacional real e deixe claro que a
resposta é somente uma demonstração de voz.`,
        prompt: buildPrompt(normalizeHistory(messages), context),
        temperature: 0.2,
        maxOutputTokens: 300,
        abortSignal: AbortSignal.timeout(Number(env.AI_SDK_TIMEOUT_MS) || 12_000),
      })

      const reply = String(text || '').trim()
      if (!reply) throw new Error('O provider ai-sdk retornou uma resposta vazia.')
      return { reply, latencyMs: Math.round(performance.now() - startedAt) }
    },
  }
}
