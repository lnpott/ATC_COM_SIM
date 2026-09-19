const INTENTS = [
  { name: 'emergencia', terms: ['mayday', 'pan pan', 'emergência', 'emergency', 'falha de motor'], source: 'MCA-100-16-art0064' },
  { name: 'taxi', terms: ['táxi', 'taxi'], source: 'MCA-100-16-art0125' },
  { name: 'decolagem', terms: ['decolagem', 'partida', 'departure', 'take-off'], source: 'MCA-100-16-art0126' },
  { name: 'aproximacao', terms: ['aproximação', 'aproximacao', 'approach', 'ils'], source: 'MCA-100-16-art0114' },
  { name: 'pouso', terms: ['pouso', 'landing', 'final'], source: 'MCA-100-16-art0132' },
];

export function detectIntent(text) {
  const normalized = text.toLocaleLowerCase('pt-BR');
  return INTENTS.find(({ terms }) => terms.some((term) => normalized.includes(term))) ?? null;
}

export function searchPhaseForIntent(intent, currentPhase) {
  return ({ taxi: 'solo', decolagem: 'decolagem', aproximacao: 'aproximacao', pouso: 'pouso', emergencia: 'emergencia' })[intent?.name] ?? currentPhase;
}

export function createGroundedControllerReply({ text, idioma, state, searchResults }) {
  const evidence = searchResults.filter(({ score }) => score > 0);
  const intent = detectIntent(text);
  if (!intent || evidence.length === 0) {
    return { covered: false, spokenText: idioma === 'en' ? 'No documentary coverage.' : 'Não há cobertura documental.', sourceIds: [], stateUpdate: null };
  }
  const source = evidence.find(({ id }) => id === intent.source);
  if (!source) {
    return { covered: false, spokenText: idioma === 'en' ? 'No documentary coverage.' : 'Não há cobertura documental.', sourceIds: [], stateUpdate: null };
  }
  const callSign = state.aeronave.indicativo;
  const runway = state.cenario.pista_em_uso;
  const qnh = state.cenario.qnh;
  const replies = idioma === 'en' ? {
    taxi: `${callSign}, taxi to holding point runway ${runway}, QNH ${qnh}.`,
    decolagem: `${callSign}, runway ${runway}, cleared for take-off.`,
    aproximacao: `${callSign}, cleared approach runway ${runway}.`,
    pouso: `${callSign}, runway ${runway}, cleared to land.`,
    emergencia: `${callSign}, roger Mayday, runway ${runway} available, report position.`,
  } : {
    taxi: `${callSign}, autorizado táxi para o ponto de espera da pista ${runway}, QNH ${qnh}.`,
    decolagem: `${callSign}, pista ${runway}, decolagem autorizada.`,
    aproximacao: `${callSign}, autorizado aproximação pista ${runway}.`,
    pouso: `${callSign}, pista ${runway}, pouso autorizado.`,
    emergencia: `${callSign}, ciente Mayday, pista ${runway} disponível, reporte posição.`,
  };
  const updates = {
    taxi: null,
    decolagem: state.fase === 'solo' ? { fase: 'decolagem', frequencia: 'torre' } : null,
    aproximacao: ['decolagem', 'rota'].includes(state.fase) ? { fase: 'aproximacao', frequencia: 'aproximacao' } : null,
    pouso: state.fase === 'aproximacao' ? { fase: 'pouso', frequencia: 'torre' } : null,
    emergencia: null,
  };
  return { covered: true, spokenText: replies[intent.name], sourceIds: [source.id], stateUpdate: updates[intent.name], source };
}
