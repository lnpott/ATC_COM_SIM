/**
 * Provider-independent client boundary. Provider credentials and SDK calls live
 * exclusively behind the server endpoint.
 */
export async function generateReply(messages, context = {}) {
  const response = await fetch('/api/generate-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Não foi possível obter uma resposta do controlador.')
  }

  if (typeof payload.reply !== 'string' || !payload.reply.trim()) {
    throw new Error('O servidor retornou uma resposta vazia.')
  }

  return payload.reply.trim()
}
