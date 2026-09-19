export const FLIGHT_PHASES = Object.freeze([
  'solo', 'decolagem', 'rota', 'aproximacao', 'pouso', 'encerrado',
]);

const NEXT_PHASES = {
  solo: new Set(['decolagem']),
  decolagem: new Set(['rota', 'aproximacao']),
  rota: new Set(['aproximacao']),
  aproximacao: new Set(['pouso', 'rota']),
  pouso: new Set(['solo', 'encerrado']),
  encerrado: new Set(),
};

export function createSimulationState({ aeronave, cenario, fase = 'solo', frequencia = 'solo' }) {
  if (!aeronave?.indicativo || !cenario?.aerodromo) {
    throw new TypeError('aeronave.indicativo e cenario.aerodromo são obrigatórios.');
  }
  if (!FLIGHT_PHASES.includes(fase)) throw new RangeError(`fase inválida: ${fase}.`);
  return structuredClone({ aeronave, cenario, fase, frequencia, historico: [] });
}

export function applyStateUpdate(state, update) {
  const next = structuredClone(state);
  if (update.fase && update.fase !== state.fase) {
    if (!NEXT_PHASES[state.fase]?.has(update.fase)) {
      throw new RangeError(`transição inválida: ${state.fase} -> ${update.fase}.`);
    }
    next.fase = update.fase;
  }
  if (update.frequencia) next.frequencia = update.frequencia;
  if (update.aeronave) {
    const allowed = new Set(['posicao', 'altitude', 'proa', 'velocidade']);
    for (const key of Object.keys(update.aeronave)) {
      if (!allowed.has(key)) throw new TypeError(`campo de aeronave não atualizável: ${key}.`);
    }
    Object.assign(next.aeronave, update.aeronave);
  }
  return next;
}

export function recordTransmission(state, transmission) {
  if (!['piloto', 'atco', 'trafego'].includes(transmission?.origem) || !transmission.texto) {
    throw new TypeError('transmissão inválida.');
  }
  const next = structuredClone(state);
  next.historico.push({ ...transmission, sequencia: next.historico.length + 1 });
  return next;
}
