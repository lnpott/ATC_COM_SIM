import { runProvider } from './providers.js'

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 50_000) reject(new Error('Corpo da requisição muito grande.'))
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

export function createGenerateReplyHandler(env = process.env) {
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (request.method !== 'POST') {
      response.statusCode = 405
      response.setHeader('Allow', 'POST')
      response.end(JSON.stringify({ error: 'Método não permitido.' }))
      return
    }

    try {
      const body = JSON.parse(await readBody(request) || '{}')
      if (!Array.isArray(body.messages) || !body.messages.length) {
        response.statusCode = 400
        response.end(JSON.stringify({ error: 'Envie ao menos uma mensagem.' }))
        return
      }
      const messages = body.messages
        .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string')
        .slice(-12)
        .map((message) => ({ ...message, content: message.content.slice(0, 4_000) }))
      const reply = await runProvider(messages, body.context, env)
      response.end(JSON.stringify({ reply }))
    } catch (error) {
      response.statusCode = 500
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno.' }))
    }
  }
}
