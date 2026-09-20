const SYSTEM_PROMPT = `Você participa de uma prova de conceito de áudio para um simulador ATC.
Responda como um controlador, de forma breve e no idioma solicitado. Nesta fase não há base
documental nem estado de voo: não emita uma autorização operacional real e deixe claro que a
resposta é somente uma demonstração de voz.`

function asPrompt(messages, context) {
  const language = context?.language === 'en-US' ? 'English (US)' : 'Português (Brasil)'
  return [{ role: 'system', content: `${SYSTEM_PROMPT}\nIdioma: ${language}.` }, ...messages]
}

async function groq(messages, context, env) {
  if (!env.GROQ_API_KEY || !env.GROQ_MODEL) throw new Error('GROQ_API_KEY e GROQ_MODEL não configurados.')
  assertZeroCostRequest({ provider: 'groq', model: env.GROQ_MODEL, env })
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.GROQ_MODEL, messages: asPrompt(messages, context), temperature: 0.2 }),
  })
  if (!response.ok) throw new Error(`Groq respondeu com status ${response.status}.`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content
}

async function mock(_messages, context) {
  return context?.language === 'en-US'
    ? 'Transmission received. Voice loop demonstration complete; this is not an operational clearance.'
    : 'Transmissão recebida. Ciclo de voz demonstrado; isto não é uma autorização operacional.'
}

const providers = { groq, mock, 'auto-free': mock }

export async function runProvider(messages, context, env = process.env) {
  const providerName = (env.LLM_PROVIDER || 'auto-free').toLowerCase()
  const provider = providers[providerName]
  if (!provider) throw new Error(`Provedor LLM_PROVIDER desconhecido: ${providerName}.`)
  const reply = await provider(messages, context, env)
  if (!reply) throw new Error('O provedor retornou uma resposta vazia.')
  return reply
}
import { assertZeroCostRequest } from './cost-policy.js'
