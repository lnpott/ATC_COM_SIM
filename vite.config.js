import { defineConfig, loadEnv } from 'vite'
import { createInterpretTransmissionHandler } from './server/interpret-transmission.js'
import { createTranscribeHandler } from './server/transcribe.js'
import { resolve } from 'node:path'

/**
 * API de desenvolvimento (F7).
 *
 * Só as duas rotas da arquitetura oficial ficam montadas: `interpret-transmission` (que é o
 * interpretador semântico com grounding obrigatório) e `transcribe` (STT). A rota
 * `/api/generate-reply` e a cadeia de provider sem grounding foram removidas com a interface
 * paralela; a única entrada de build é o simulador documental.
 */
function simulatorApiPlugin(env) {
  return {
    name: 'simulator-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/interpret-transmission', createInterpretTransmissionHandler(env))
      server.middlewares.use('/api/transcribe', createTranscribeHandler(env))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [simulatorApiPlugin(env)],
    build: {
      rollupOptions: {
        input: {
          simulator: resolve(import.meta.dirname, 'index.html'),
        },
      },
    },
  }
})
