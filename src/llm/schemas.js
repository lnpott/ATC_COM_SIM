export const INTENTS = Object.freeze([
  'initial_contact', 'taxi_request', 'taxi_readback', 'hold_position',
  'runway_crossing_request', 'departure_request', 'takeoff_ready',
  'takeoff_readback', 'vfr_departure', 'frequency_change_request',
  'frequency_assignment_request', 'frequency_readback', 'position_report',
  'circuit_entry', 'circuit_report', 'approach_request', 'landing_request',
  'landing_readback', 'go_around', 'missed_approach', 'emergency', 'urgency',
  'weather_request', 'atis_report', 'clarification', 'repeat_request', 'unable',
  'readback', 'unknown',
])

const sources = ['explicit', 'session', 'inferred', 'unknown']
const nullableEntity = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object', additionalProperties: false,
      properties: { value: { type: 'string' }, source: { type: 'string', enum: sources }, confidence: { type: 'number', minimum: 0, maximum: 1 }, spoken: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
      required: ['value', 'source', 'confidence', 'spoken'],
    },
  ],
}

export const INTERPRETATION_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  properties: {
    language: { type: 'string', enum: ['pt-BR', 'en-US'] },
    understood: { type: 'boolean' }, ambiguous: { type: 'boolean' }, confidence: { type: 'number', minimum: 0, maximum: 1 },
    station: nullableEntity, callsign: nullableEntity, position: nullableEntity,
    flightRules: nullableEntity, atis: nullableEntity, destinationOrSector: nullableEntity,
    runway: nullableEntity, altitude: nullableEntity, heading: nullableEntity, frequency: nullableEntity,
    phase: { type: 'string', enum: ['ground', 'departure', 'enroute', 'approach', 'landing', 'unknown'] },
    intent: { type: 'string', enum: INTENTS },
    intentFamily: { type: 'string', minLength: 1, maxLength: 80 },
    requestType: { type: 'string', enum: ['controller_instruction', 'permission', 'information', 'report', 'readback', 'unknown'] },
    emergency: { type: 'boolean' }, readback: { type: 'boolean' },
    entities: { type: 'array', maxItems: 24, items: { type: 'string', maxLength: 120 } },
    missingOperationalInformation: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 120 } },
    uncertainElements: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 120 } },
    searchConcepts: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 100 } },
    semanticSummary: { type: 'string', minLength: 1, maxLength: 600 },
  },
  required: ['language', 'understood', 'ambiguous', 'confidence', 'station', 'callsign', 'position', 'flightRules', 'atis', 'destinationOrSector', 'runway', 'altitude', 'heading', 'frequency', 'phase', 'intent', 'intentFamily', 'requestType', 'emergency', 'readback', 'entities', 'missingOperationalInformation', 'uncertainElements', 'searchConcepts', 'semanticSummary'],
})

function entity(value, name) {
  if (value === null) return null
  if (!value || typeof value !== 'object' || typeof value.value !== 'string' || !sources.includes(value.source) || typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1 || !('spoken' in value)) throw new TypeError(`Entidade semântica inválida: ${name}`)
  return { value: value.value.slice(0, 160), source: value.source, confidence: value.confidence, spoken: typeof value.spoken === 'string' ? value.spoken.slice(0, 200) : null }
}

export function validateInterpretation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Interpretação semântica deve ser um objeto.')
  const expected = new Set(INTERPRETATION_SCHEMA.required)
  if (Object.keys(value).some((key) => !expected.has(key)) || [...expected].some((key) => !(key in value))) throw new TypeError('Campos da interpretação semântica inválidos.')
  if (!['pt-BR', 'en-US'].includes(value.language) || !INTENTS.includes(value.intent)) throw new TypeError('Idioma ou intenção semântica inválida.')
  if (typeof value.understood !== 'boolean' || typeof value.ambiguous !== 'boolean' || typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) throw new TypeError('Confiança semântica inválida.')
  if (!['ground', 'departure', 'enroute', 'approach', 'landing', 'unknown'].includes(value.phase) || !['controller_instruction', 'permission', 'information', 'report', 'readback', 'unknown'].includes(value.requestType)) throw new TypeError('Fase ou tipo de solicitação inválido.')
  if (typeof value.emergency !== 'boolean' || typeof value.readback !== 'boolean' || typeof value.intentFamily !== 'string' || !value.intentFamily || value.intentFamily.length > 80) throw new TypeError('Classificação semântica inválida.')
  const result = { ...value }
  for (const name of ['station', 'callsign', 'position', 'flightRules', 'atis', 'destinationOrSector', 'runway', 'altitude', 'heading', 'frequency']) result[name] = entity(value[name], name)
  for (const name of ['entities', 'missingOperationalInformation', 'uncertainElements', 'searchConcepts']) {
    if (!Array.isArray(value[name]) || value[name].some((item) => typeof item !== 'string')) throw new TypeError(`Lista semântica inválida: ${name}`)
    result[name] = value[name].slice(0, name === 'entities' ? 24 : 12).map((item) => item.slice(0, 120))
  }
  if (!value.semanticSummary || typeof value.semanticSummary !== 'string') throw new TypeError('Resumo semântico inválido.')
  return Object.freeze(result)
}
