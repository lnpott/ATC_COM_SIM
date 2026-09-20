import { tokenize } from './search.js'

const FOLD = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')

const INTENTS = Object.freeze({
  emergency: { concepts: [['mayday', 'emergenc', 'socorro'], ['falha', 'failure', 'fogo', 'fire', 'pane']], phase: 'emergencia' },
  taxi_request: { concepts: [['taxi', 'taxie', 'taxiing', 'movimenta'], ['solicit', 'request', 'pronto', 'ready', 'instruc']], phase: 'solo' },
  takeoff_request: { concepts: [['decol', 'takeoff', 'partida', 'departure'], ['pronto', 'ready', 'solicit', 'request']], phase: 'decolagem' },
  traffic_circuit: { concepts: [['circuito', 'pattern', 'downwind', 'perna'], ['ingress', 'join', 'entrada', 'enter']], phase: 'aproximacao' },
  approach_request: { concepts: [['aproxim', 'approach', 'ils', 'rnav'], ['solicit', 'request', 'autoriz', 'clear']], phase: 'aproximacao' },
  landing_request: { concepts: [['pous', 'landing', 'land'], ['final', 'solicit', 'request', 'autoriz', 'clear']], phase: 'pouso' },
  frequency_change: { concepts: [['frequenc', 'frequency'], ['troca', 'mudanc', 'change', 'monitor', 'contact', 'chame', 'solicit', 'request']], phase: 'rota' },
  vfr_departure: { concepts: [['vfr'], ['saida', 'departure', 'outbound', 'setor', 'sector']], phase: 'decolagem' },
  readback: { concepts: [['ciente', 'copiado', 'roger', 'wilco', 'readback', 'cotej'], ['pista', 'runway', 'qnh', 'proa', 'heading', 'nivel', 'level']], phase: null },
  weather_request: { concepts: [['meteorolog', 'weather', 'metar'], ['solicit', 'request', 'informe', 'report']], phase: null },
})

const REQUEST = ['solicit', 'request', 'pronto', 'ready', 'gostaria', 'necessit', 'intend']
const SERVICES = ['solo', 'ground', 'torre', 'tower', 'controle', 'control', 'aproximacao', 'approach', 'radio', 'trafego', 'delivery']
const KNOWN = new Set([...REQUEST, ...SERVICES, 'bom', 'dia', 'boa', 'tarde', 'noite', 'good', 'morning', 'afternoon', 'evening', 'informacao', 'information', 'posicao', 'position', 'stand', 'box', 'gate', 'para', 'to', 'setor', 'sector', 'vfr', 'ifr'])

function hasStem(tokens, stems) {
  return tokens.some((token) => stems.some((stem) => token.startsWith(stem)))
}

function scoreIntent(tokens, definition, state) {
  if (!hasStem(tokens, definition.concepts[0])) return 0
  const matched = definition.concepts.filter((group) => hasStem(tokens, group)).length
  if (!matched) return 0
  let score = matched / definition.concepts.length
  if (matched === definition.concepts.length) score += 0.35
  if (definition === INTENTS.emergency && hasStem(tokens, definition.concepts[0])) score = Math.max(score, 0.98)
  if (definition.phase && state?.fase === definition.phase) score += 0.08
  return Math.min(1, score)
}

function matchAfter(text, labels, valuePattern = '[\\p{L}\\p{N}-]+(?:\\s+[\\p{L}\\p{N}-]+)?') {
  const match = text.match(new RegExp(`\\b(?:${labels.join('|')})\\b\\s+(?:de\\s+|do\\s+|the\\s+)?(${valuePattern})`, 'iu'))
  return match?.[1]?.trim()
}

function extractCallSign(text) {
  const compact = text.match(/\b([A-Z]{2,3})[- ]?(\d{2,4}|[A-Z]{2,3})\b/)
  if (compact) return `${compact[1]}-${compact[2]}`
  const phonetic = text.match(/\b(papa|november|pr|pt)\s+(tango|romeo|papa)\s+(alfa|alpha)\s+(bravo|charlie|delta)\b/i)
  if (!phonetic) return undefined
  const letter = { papa: 'P', november: 'N', pr: 'PR', pt: 'PT', tango: 'T', romeo: 'R', alfa: 'A', alpha: 'A', bravo: 'B', charlie: 'C', delta: 'D' }
  return phonetic.slice(1).map((part) => letter[FOLD(part)]).join('')
}

function extractFrequency(text) {
  const match = text.match(/\b(1\d{2})[,.](\d{1,3})\b/)
  return match ? `${match[1]}.${match[2]}` : undefined
}

function extractNumberAfter(text, labels) {
  const value = matchAfter(text, labels, '(?:FL\\s*)?\\d{1,5}(?:[,.]\\d+)?')
  return value?.replace(',', '.')
}

/** Deterministic semantic interpretation. It extracts independent concepts instead of matching complete phrases. */
export function interpretTransmission(text, { idioma = 'pt', state } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('transmissão deve ser uma string não vazia.')
  const folded = FOLD(text)
  const tokens = tokenize(folded)
  const ranking = Object.entries(INTENTS)
    .map(([name, definition]) => ({ name, score: scoreIntent(tokens, definition, state), phase: definition.phase }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
  const top = ranking[0]
  const second = ranking[1]
  const ambiguous = Boolean(top && second && top.score - second.score < 0.12 && top.name !== 'vfr_departure' && second.name !== 'vfr_departure')
  const serviceIndex = tokens.findIndex((token) => SERVICES.includes(token))
  const stationCalled = serviceIndex >= 0 ? [tokens[serviceIndex], tokens[serviceIndex + 1]].filter(Boolean).join(' ') : undefined
  const atis = matchAfter(text, ['informação', 'informacao', 'information'], '[A-Za-z]+')
  const position = matchAfter(text, ['posição', 'posicao', 'position', 'stand', 'box', 'gate'], '[\\p{L}\\p{N}-]+')
  const sector = matchAfter(text, ['setor', 'sector'], '[\\p{L}-]+')
  const destination = sector ?? matchAfter(text, ['destino', 'destination', 'para', 'to'], '[\\p{L}-]+')
  const runway = matchAfter(text, ['pista', 'runway'], '\\d{1,2}[LRC]?')
  const altitude = extractNumberAfter(text, ['altitude', 'altitude', 'nível', 'nivel', 'level', 'FL'])
  const heading = extractNumberAfter(text, ['proa', 'heading'])
  const flightRules = tokens.includes('vfr') ? 'VFR' : tokens.includes('ifr') ? 'IFR' : undefined
  const callSign = extractCallSign(text)
  const request = hasStem(tokens, REQUEST)
  const frequencyRequestType = hasStem(tokens, ['troca', 'mudanc', 'change']) ? 'change_permission' : hasStem(tokens, ['solicit', 'request']) && hasStem(tokens, ['frequenc', 'frequency']) ? 'assignment_request' : undefined
  const vfrDeparture = ranking.find(({ name }) => name === 'vfr_departure')
  const primary = top?.name === 'takeoff_request' && vfrDeparture?.score >= 0.85 ? vfrDeparture : top
  const confidence = ambiguous ? Math.min(primary?.score ?? 0, 0.49) : primary?.score ?? 0
  const recognized = new Set(ranking.flatMap(({ name }) => INTENTS[name].concepts.flat()).map(FOLD))
  const unknownElements = tokens.filter((token) => token.length > 2 && !KNOWN.has(token) && ![...recognized].some((stem) => token.startsWith(stem))).slice(0, 12)

  return Object.freeze({
    rawText: text,
    language: idioma,
    stationCalled,
    callSign,
    position,
    airport: state?.cenario?.aerodromo,
    frequencySector: stationCalled?.split(' ')[0],
    flightPhase: primary?.phase ?? state?.fase,
    intent: ambiguous ? 'ambiguous' : primary?.name ?? 'unknown',
    operationType: request ? 'request' : 'report',
    flightRules,
    destination,
    atis: atis?.toUpperCase(),
    runway,
    altitude,
    heading,
    frequency: extractFrequency(text),
    frequencyRequestType,
    emergency: ranking.some(({ name, score }) => name === 'emergency' && score >= 0.5),
    operationalRequest: request,
    readback: primary?.name === 'readback',
    unknownElements,
    confidence: Number(confidence.toFixed(3)),
    candidates: ranking.slice(0, 4),
  })
}

export function intentDefinition(intent) {
  return INTENTS[intent]
}
