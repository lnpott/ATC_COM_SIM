import { configuredCandidates } from '../server/model-registry.js'
import { costPolicy, isProviderAllowed } from '../server/cost-policy.js'
import { createOpenRouterProvider } from '../src/llm/openrouter-provider.js'
import { interpretSemantically } from '../src/llm/semantic-interpreter.js'

const env = { ...process.env, ZERO_COST_MODE: 'true', ALLOW_PAID_API: 'false', OPENROUTER_FREE_ONLY: 'true' }
const policy = costPolicy(env)
const candidates = configuredCandidates(env).filter(({ provider, id }) => provider === 'openrouter' && env.OPENROUTER_API_KEY && isProviderAllowed(provider, id, env))
const cases = [
  ['pt', 'Pronto para movimentação no pátio.', 'taxi_request'],
  ['en', 'Ground PTABC stand two, VFR northbound, request taxi.', 'taxi_request'],
  ['pt', 'PTABC solicito mudança de frequência.', 'frequency_change_request'],
  ['en', 'Mayday PTABC engine failure, position north of field.', 'emergency'],
]
const reports = []
for (const candidate of candidates) {
  let correct = 0; let schemaSuccess = 0; const latencies = []; const actualModels = new Set(); const failures = []
  const provider = createOpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY, model: candidate.id, env, timeoutMs: 12_000 })
  for (const [language, text, expected] of cases) try {
    const result = await interpretSemantically({ rawTranscript: text, normalizedTranscript: text, language, sessionContext: { callsign: 'PTABC', airport: 'SBGL' }, scenarioContext: { airport: 'SBGL', runway: '18' } }, provider)
    schemaSuccess += 1; if (result.interpretation.intent === expected) correct += 1; latencies.push(result.latencyMs); actualModels.add(result.actualModel)
  } catch (error) { failures.push(error.code || 'error') }
  reports.push({ provider: candidate.provider, requestedModel: candidate.id, freeValidated: true, cases: cases.length, semanticAccuracy: correct / cases.length, schemaSuccess: schemaSuccess / cases.length, latencyP50Ms: latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] ?? null, actualModels: [...actualModels], failures })
}
console.log(JSON.stringify({ zeroCostMode: policy.zeroCostMode, allowPaidApi: policy.allowPaidApi, groqIncluded: false, reason: 'GROQ_FREE_TIER_CONFIRMED não verificado', reports }, null, 2))
if (candidates.length && !reports.some(({ schemaSuccess }) => schemaSuccess > 0)) process.exitCode = 1
