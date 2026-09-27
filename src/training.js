/**
 * Treino e relatório de sessão.
 *
 * O cotejamento saiu daqui para `src/readback-rules.js` (F2): havia **dois** avaliadores
 * divergentes neste arquivo (`evaluateReadback` por substring e `evaluateReadbackSemantic` por
 * regex sobre todo o texto), e ambos exigiam de volta tudo que a frase do controlador continha —
 * inclusive QNH meramente informativo. O avaliador consolidado compara a autorização pendente
 * estruturada com o texto cotejado e cobra somente o que a autorização exige.
 *
 * `operationalValues` continua exportado daqui para os consumidores históricos (o diálogo usa a
 * extração de valores para decidir se uma autorização tem item cotejável).
 */
export {
  buildPendingAuthorization,
  evaluateReadbackAgainstPending,
  operationalValues,
  pendingFromState,
} from './readback-rules.js'

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
