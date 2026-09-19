export const SCENARIOS = Object.freeze({
  vfr_local_pt: Object.freeze({ idioma: 'pt', fase: 'solo', aeronave: { indicativo: 'PT-ABC', tipo: 'C172', posicao: 'pátio', altitude: 0, proa: 0, velocidade: 0 }, cenario: { aerodromo: 'SBJD', pista_em_uso: '18', qnh: 1015, condicoes_meteo: 'VMC', trafego_na_frequencia: [] }, frequencia: 'solo' }),
  vfr_local_en: Object.freeze({ idioma: 'en', fase: 'solo', aeronave: { indicativo: 'PT-ABC', tipo: 'C172', posicao: 'apron', altitude: 0, proa: 0, velocidade: 0 }, cenario: { aerodromo: 'SBJD', pista_em_uso: '18', qnh: 1015, condicoes_meteo: 'VMC', trafego_na_frequencia: [] }, frequencia: 'ground' }),
  ifr_partida_pt: Object.freeze({ idioma: 'pt', fase: 'solo', aeronave: { indicativo: 'PR-IFR', tipo: 'B738', posicao: 'gate', altitude: 0, proa: 0, velocidade: 0 }, cenario: { aerodromo: 'SBGR', pista_em_uso: '10', qnh: 1013, condicoes_meteo: 'IMC', trafego_na_frequencia: [] }, frequencia: 'solo' }),
  emergencia_motor_pt: Object.freeze({ idioma: 'pt', fase: 'rota', aeronave: { indicativo: 'PT-EMG', tipo: 'C172', posicao: '20 NM sul', altitude: 3000, proa: 360, velocidade: 90 }, cenario: { aerodromo: 'SBCA', pista_em_uso: '15', qnh: 1012, condicoes_meteo: 'VMC', trafego_na_frequencia: [] }, frequencia: 'controle' }),
});

export function getScenario(name) {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new RangeError(`cenário desconhecido: ${name}.`);
  return structuredClone(scenario);
}
