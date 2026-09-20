import { interpretTransmission } from './transmission.js';
import { evaluateReadbackSemantic } from './training.js';

const INTENTS = [
  { name: 'emergencia', terms: ['mayday', 'pan pan', 'emergência', 'emergency', 'falha de motor'], source: 'MCA-100-16-artigo-0064-001' },
  { name: 'taxi', terms: ['táxi', 'taxi'], source: 'MCA-100-16-artigo-0125-001' },
  { name: 'decolagem', terms: ['decolagem', 'partida', 'departure', 'take-off'], source: 'MCA-100-16-artigo-0126-001' },
  { name: 'aproximacao', terms: ['aproximação', 'aproximacao', 'approach', 'ils'], source: 'MCA-100-16-artigo-0114-001' },
  { name: 'pouso', terms: ['pouso', 'landing', 'final'], source: 'MCA-100-16-artigo-0132-001' },
];

export function detectIntent(text) {
  const normalized = text.toLocaleLowerCase('pt-BR');
  return INTENTS.find(({ terms }) => terms.some((term) => normalized.includes(term))) ?? null;
}

export function searchPhaseForIntent(intent, currentPhase) {
  return ({ taxi: 'solo', decolagem: 'decolagem', aproximacao: 'aproximacao', pouso: 'pouso', emergencia: 'emergencia' })[intent?.name] ?? currentPhase;
}

export function createGroundedControllerReply(input) {
  return decideGroundedReply(input);
}

const SOURCE_BY_INTENT = {
  emergency: 'MCA-100-16-artigo-0064-001',
  taxi_request: 'MCA-100-16-artigo-0125-001',
  takeoff_request: 'MCA-100-16-artigo-0126-001',
  traffic_circuit: 'MCA-100-16-artigo-0129-001',
  approach_request: 'MCA-100-16-artigo-0114-001',
  landing_request: 'MCA-100-16-artigo-0132-001',
  frequency_change: 'MCA-100-16-artigo-0059-001',
  vfr_departure: 'MCA-100-16-artigo-0122-001',
  readback: 'MCA-100-16-artigo-0012-001',
};

const LEGACY_NAMES = { taxi: 'taxi_request', decolagem: 'takeoff_request', aproximacao: 'approach_request', pouso: 'landing_request', emergencia: 'emergency' };

export function decideGroundedReply({ text, idioma, state, searchResults, interpretation }) {
  const evidence = searchResults.filter(({ score }) => score > 0);
  const legacy = detectIntent(text);
  const understood = interpretation ?? (legacy ? { intent: LEGACY_NAMES[legacy.name], confidence: 1 } : interpretTransmission(text, { idioma, state }));
  if (understood.intent === 'unknown' || understood.intent === 'ambiguous') {
    return outcome('not_understood', idioma === 'en' ? 'I did not understand your operational request. Say your intentions.' : 'Não entendi sua solicitação operacional. Informe suas intenções.', 'intent-not-understood');
  }
  if (understood.intent === 'frequency_change' && understood.frequencyRequestType === 'assignment_request') {
    return outcome('operational_context_missing', idioma === 'en' ? 'Transfer frequency is not configured for this scenario; remain on this frequency.' : 'A frequência de transferência não está configurada para este cenário; mantenha esta frequência.', 'controller-frequency-not-configured');
  }
  const missing = missingInformation(understood, state);
  if (missing.length) {
    const fields = missing.join(', ');
    return outcome('needs_clarification', idioma === 'en' ? `Confirm ${fields}.` : `Confirme ${fields}.`, `missing:${fields}`);
  }
  const expectedSource = SOURCE_BY_INTENT[understood.intent];
  const source = evidence.find(({ id }) => id === expectedSource);
  if (!source) {
    return outcome('unsupported', idioma === 'en' ? 'No documentary coverage for that request.' : 'Não há cobertura documental para essa solicitação.', 'relevant-evidence-not-retrieved');
  }
  if (understood.intent === 'readback') {
    const assessment = evaluateReadbackSemantic({ autorizacao: state.contexto.ultima_autorizacao, cotejamento: text })
    if (!assessment.correct) {
      const details = [...assessment.missing, ...assessment.contradictory].join(', ')
      const spokenText = idioma === 'en' ? `Readback ${assessment.classification}; confirm ${details || 'the clearance'}.` : `Cotejamento ${assessment.classification === 'contradictory' ? 'divergente' : 'incompleto'}; confirme ${details || 'a autorização'}.`
      return { covered: true, status: 'needs_clarification', reason: `readback:${assessment.classification}`, spokenText, sourceIds: [source.id], stateUpdate: null, source, interpretation: understood, readbackAssessment: assessment }
    }
  }
  const callSign = state.aeronave.indicativo;
  const runway = state.cenario.pista_em_uso;
  const qnh = state.cenario.qnh;
  const replies = idioma === 'en' ? {
    taxi_request: `${callSign}, taxi to holding point runway ${runway}, QNH ${qnh}.`,
    takeoff_request: `${callSign}, runway ${runway}, cleared for take-off.`,
    traffic_circuit: `${callSign}, cleared to join the traffic pattern runway ${runway}, QNH ${qnh}.`,
    approach_request: `${callSign}, cleared approach runway ${runway}.`,
    landing_request: `${callSign}, runway ${runway}, cleared to land.`,
    emergency: `${callSign}, roger Mayday, runway ${runway} available, report position.`,
    frequency_change: `${callSign}, frequency change approved.`,
    vfr_departure: `${callSign}, VFR departure toward ${understood.destination}, runway ${runway}, QNH ${qnh}.`,
    readback: `${callSign}, readback correct.`,
  } : {
    taxi_request: `${callSign}, autorizado táxi para o ponto de espera da pista ${runway}, QNH ${qnh}.`,
    takeoff_request: `${callSign}, pista ${runway}, decolagem autorizada.`,
    traffic_circuit: `${callSign}, autorizado ingresso no circuito de tráfego da pista ${runway}, QNH ${qnh}.`,
    approach_request: `${callSign}, autorizado aproximação pista ${runway}.`,
    landing_request: `${callSign}, pista ${runway}, pouso autorizado.`,
    emergency: `${callSign}, ciente Mayday, pista ${runway} disponível, reporte posição.`,
    frequency_change: `${callSign}, mudança de frequência aprovada.`,
    vfr_departure: `${callSign}, saída VFR para ${understood.destination}, pista ${runway}, QNH ${qnh}.`,
    readback: `${callSign}, cotejamento correto.`,
  };
  const updates = {
    taxi_request: contextUpdate(understood),
    takeoff_request: state.fase === 'solo' ? { fase: 'decolagem', frequencia: 'torre', contexto: contextUpdate(understood).contexto } : contextUpdate(understood),
    traffic_circuit: ['decolagem', 'rota'].includes(state.fase) ? { fase: 'aproximacao', frequencia: 'torre', contexto: contextUpdate(understood).contexto } : contextUpdate(understood),
    approach_request: ['decolagem', 'rota'].includes(state.fase) ? { fase: 'aproximacao', frequencia: 'aproximacao', contexto: contextUpdate(understood).contexto } : contextUpdate(understood),
    landing_request: state.fase === 'aproximacao' ? { fase: 'pouso', frequencia: 'torre', contexto: contextUpdate(understood).contexto } : contextUpdate(understood),
    emergency: contextUpdate(understood),
    frequency_change: contextUpdate(understood),
    vfr_departure: contextUpdate(understood),
    readback: contextUpdate(understood),
  };
  const stateUpdate = updates[understood.intent];
  stateUpdate.contexto = { ...(stateUpdate.contexto ?? {}), ultima_autorizacao: replies[understood.intent], ultima_instrucao_controlador: replies[understood.intent], ultima_intencao: understood.intent, cotejamento_pendente: understood.intent !== 'readback', emergencia_ativa: understood.intent === 'emergency' || state.contexto?.emergencia_ativa === true };
  return { covered: true, status: 'documented', reason: 'grounded', spokenText: replies[understood.intent], sourceIds: [source.id], stateUpdate, source, interpretation: understood };
}

function missingInformation(interpretation, state) {
  const missing = [];
  if (interpretation.intent === 'vfr_departure' && !interpretation.destination && !state.contexto?.destino) missing.push(interpretation.language === 'en' ? 'destination or sector' : 'destino ou setor')
  if (interpretation.intent === 'readback' && !state.contexto?.ultima_autorizacao) missing.push(interpretation.language === 'en' ? 'clearance being read back' : 'autorização cotejada')
  return missing
}

function contextUpdate(interpretation) {
  const update = { contexto: Object.fromEntries(Object.entries({ atis: interpretation.atis, regras_voo: interpretation.flightRules, destino: interpretation.destination, ultima_intencao: interpretation.intent }).filter(([, value]) => value !== undefined)) }
  if (interpretation.position) update.aeronave = { posicao: interpretation.position }
  return update
}

function outcome(status, spokenText, reason) {
  return { covered: false, status, reason, spokenText, sourceIds: [], stateUpdate: null, source: null }
}
