import { assertZeroCostRequest, costPolicy } from './cost-policy.js'

const MAX_AUDIO_BYTES = 6 * 1024 * 1024
const ALLOWED_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'])

async function readBody(request) {
  const chunks = []; let size = 0
  for await (const chunk of request) { size += chunk.length; if (size > MAX_AUDIO_BYTES + 32_000) throw Object.assign(new Error('audio_too_large'), { status: 413 }); chunks.push(chunk) }
  return Buffer.concat(chunks)
}

function parseMultipart(buffer, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.slice(1).find(Boolean)
  if (!boundary) throw Object.assign(new Error('multipart_boundary_missing'), { status: 400 })
  const marker = Buffer.from(`--${boundary}`); const fields = {}; let audio
  let cursor = buffer.indexOf(marker)
  while (cursor >= 0) {
    const next = buffer.indexOf(marker, cursor + marker.length); if (next < 0) break
    const part = buffer.subarray(cursor + marker.length + 2, next - 2); cursor = next
    const split = part.indexOf(Buffer.from('\r\n\r\n')); if (split < 0) continue
    const headers = part.subarray(0, split).toString('utf8'); const content = part.subarray(split + 4)
    const name = /name="([^"]+)"/i.exec(headers)?.[1]; const filename = /filename="([^"]*)"/i.exec(headers)?.[1]
    const mime = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.split(';')[0].toLowerCase()
    if (name === 'audio' && filename) audio = { bytes: content, filename, mime }
    else if (name) fields[name] = content.toString('utf8')
  }
  return { audio, fields }
}

export function createTranscribeHandler(env = process.env, { fetchImpl = fetch } = {}) {
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store')
    if (request.method !== 'POST') { response.statusCode = 405; response.setHeader('Allow', 'POST'); response.end(JSON.stringify({ error: 'method_not_allowed' })); return }
    const contentType = String(request.headers['content-type'] ?? '')
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) { response.statusCode = 415; response.end(JSON.stringify({ error: 'multipart_required' })); return }
    try {
      const { audio, fields } = parseMultipart(await readBody(request), contentType)
      if (!audio?.bytes?.length || audio.bytes.length > MAX_AUDIO_BYTES || !ALLOWED_MIME.has(audio.mime)) { response.statusCode = 400; response.end(JSON.stringify({ error: 'invalid_audio' })); return }
      const durationMs = fields.durationMs == null ? null : Number(fields.durationMs)
      if (durationMs != null && (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 120_000)) { response.statusCode = 400; response.end(JSON.stringify({ error: 'invalid_audio_duration' })); return }
      const model = env.STT_GROQ_MODEL || 'whisper-large-v3-turbo'
      assertZeroCostRequest({ provider: 'groq', model, env })
      if (!env.GROQ_API_KEY) throw Object.assign(new Error('stt_unavailable'), { code: 'stt_unavailable' })
      const form = new FormData(); form.set('file', new Blob([audio.bytes], { type: audio.mime }), audio.filename); form.set('model', model)
      if (['pt', 'en'].includes(fields.language)) form.set('language', fields.language)
      const startedAt = performance.now()
      const upstream = await fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form, signal: AbortSignal.timeout(12_000) })
      if (!upstream.ok) throw Object.assign(new Error('stt_error'), { code: upstream.status === 429 ? 'stt_free_quota' : 'stt_error' })
      const data = await upstream.json(); if (!data.text) throw Object.assign(new Error('stt_error'), { code: 'stt_error' })
      response.end(JSON.stringify({ transcript: data.text, provider: 'groq', model, mode: 'groq_free', freeValidated: true, latencyMs: Math.round(performance.now() - startedAt), audioSeconds: durationMs == null ? null : durationMs / 1000, zeroCostMode: true, costChargedExpected: 0 }))
    } catch (error) {
      const code = error?.code || error?.message || 'stt_error'
      response.statusCode = error?.status ?? ({ unverified_free_tier: 503, stt_unavailable: 503, stt_free_quota: 429, stt_timeout: 504 }[code] ?? 502)
      response.end(JSON.stringify({ error: code, zeroCostMode: costPolicy(env).zeroCostMode }))
    }
  }
}
