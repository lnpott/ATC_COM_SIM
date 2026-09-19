import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createGenerateReplyHandler } from './server/generate-reply.js'

function replyApiPlugin(env) {
  return {
    name: 'generate-reply-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-reply', createGenerateReplyHandler(env))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), replyApiPlugin(env)],
  }
})
