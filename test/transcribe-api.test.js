import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'
import { createTranscribeHandler } from '../server/transcribe.js'

function multipart() {
  const boundary = 'atc-test-boundary'
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\npt\r\n--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="ptt.webm"\r\nContent-Type: audio/webm\r\n\r\naudio-bytes\r\n--${boundary}--\r\n`)
  return { boundary, body }
}

function call(handler, { method = 'POST', contentType = 'text/plain', body = Buffer.alloc(0) } = {}) {
  const request = Readable.from([body]); request.method = method; request.headers = { 'content-type': contentType }
  let resolveDone
  const response = { headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value }, end(value = '') { this.body = value; resolveDone() } }
  const done = new Promise((resolve) => { resolveDone = resolve })
  handler(request, response)
  return done.then(() => ({ ...response, json: JSON.parse(response.body) }))
}

test('/api/transcribe valida método e multipart', async () => {
  const handler = createTranscribeHandler({})
  assert.equal((await call(handler, { method: 'GET' })).statusCode, 405)
  assert.equal((await call(handler)).statusCode, 415)
})

test('/api/transcribe bloqueia Groq não confirmado antes da rede', async () => {
  let networkCalls = 0; const fixture = multipart()
  const handler = createTranscribeHandler({ ZERO_COST_MODE: 'true', ALLOW_PAID_API: 'false', GROQ_FREE_TIER_CONFIRMED: 'false', GROQ_API_KEY: 'test' }, { fetchImpl: async () => { networkCalls += 1 } })
  const response = await call(handler, { contentType: `multipart/form-data; boundary=${fixture.boundary}`, body: fixture.body })
  assert.equal(response.statusCode, 503); assert.equal(response.json.error, 'unverified_free_tier'); assert.equal(networkCalls, 0)
})
