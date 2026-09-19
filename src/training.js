const REQUIRED_READBACK = [
  { item: 'pista', aliases: ['pista', 'runway'] },
  { item: 'qnh', aliases: ['qnh', 'altimeter'] },
  { item: 'nível', aliases: ['nível', 'nivel', 'flight level'] },
  { item: 'proa', aliases: ['proa', 'heading'] },
  { item: 'frequência', aliases: ['frequência', 'frequencia', 'frequency'] },
  { item: 'transponder', aliases: ['transponder', 'squawk'] },
];

export function evaluateReadback({ autorizacao, cotejamento }) {
  const clearance = autorizacao.toLocaleLowerCase('pt-BR');
  const spoken = cotejamento.toLocaleLowerCase('pt-BR');
  const required = REQUIRED_READBACK.filter(({ aliases }) => aliases.some((term) => clearance.includes(term)));
  const expected = required.map(({ item }) => item);
  const omitidos = required.filter(({ aliases }) => !aliases.some((term) => spoken.includes(term))).map(({ item }) => item);
  return { correto: omitidos.length === 0, itens_esperados: expected, omitidos, score: expected.length ? Math.round(100 * (expected.length - omitidos.length) / expected.length) : 100 };
}

export function explainResult(result) {
  if (!result?.id || !result.documento || !result.artigo) throw new TypeError('resultado sem procedência.');
  return { citacao: `${result.documento}, ${result.artigo}`, id: result.id, texto: result.texto };
}

export function buildSessionReport(history, evaluations) {
  const errors = evaluations.flatMap(({ omitidos = [] }) => omitidos);
  const recorrencias = Object.fromEntries([...new Set(errors)].map((term) => [term, errors.filter((item) => item === term).length]));
  const score = evaluations.length ? Math.round(evaluations.reduce((sum, item) => sum + item.score, 0) / evaluations.length) : 100;
  return { transmissoes: history.length, avaliacoes: evaluations.length, score, erros_recorrentes: recorrencias };
}
