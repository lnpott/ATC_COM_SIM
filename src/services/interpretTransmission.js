import { toPipelineInterpretation } from '../llm/semantic-interpreter.js'

export async function requestSemanticInterpretation(input, { fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl('/api/interpret-transmission', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify(input),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.interpretationMode !== 'llm' || !body.interpretation) {
    const error = new Error(`Interpretador semântico indisponível (${body.error || response.status}).`)
    error.code = body.error || 'llm_unavailable'; throw error
  }
  return { ...body, pipelineInterpretation: toPipelineInterpretation(body.interpretation, input.rawTranscript) }
}
