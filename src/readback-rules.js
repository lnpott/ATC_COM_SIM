/**
 * Regras de cotejamento (F2 — resolve a divergência A3.4).
 *
 * Fonte normativa: MCA 100-16, Art. 12, III — obriga a repetição de **pista em uso, ajuste do
 * altímetro, código SSR, nível/altitude, proa, velocidade e frequência**; o Art. 45 reforça a
 * obrigação e o Art. 39 define o vocabulário (COTEJE / READ BACK, NEGATIVO / NEGATIVE).
 *
 * Princípio desta camada — **o que é exigido vem da natureza do elemento falado, não da
 * quantidade de números na frase**:
 *
 * 1. uma autorização é montada por `src/phraseology.js` com `elements` tipados
 *    (`instrucao` | `informacao` | `pergunta`);
 * 2. `buildPendingAuthorization` transforma esses elementos na autorização pendente:
 *    `instrucao` → **obrigatório** de cotejar; `informacao` → **informativo** (o piloto reporta
 *    recebido, o controlador não exige de volta);
 * 3. assim, o QNH que apenas *informa* o táxi, o circuito ou a partida VFR é informativo, e a
 *    cobrança do Art. 12, III só incide quando ele for a própria instrução (reajuste de
 *    altímetro). Vento e demais dados meteorológicos não têm campo cotejável algum: são sempre
 *    informativos e nunca viram exigência (nem por aparecerem na fala do controlador);
 * 4. um valor informativo **falado com valor divergente** continua sendo contradição — o Art. 12,
 *    § 1º exige corrigir o que o piloto repetiu errado, mesmo que não fosse obrigatório repetir.
 *
 * Quando não há elementos tipados (texto puro, ex.: caracterização do F0 e testes do módulo), a
 * leitura é conservadora e recai na própria lista do Art. 12, III entre os campos presentes.
 */

/** Campos extraídos de uma fala, com o mesmo vocabulário do Art. 12, III. */
const FIELD_PATTERNS = Object.freeze({
  pista: /(?:pista|runway)\s*(\d{1,2}[lrc]?)/i,
  qnh: /(?:qnh|altimeter)\s*(\d{3,4})/i,
  'frequência': /(?:frequ[eê]ncia|frequency|contate|contact)?\s*(\d{3}[.]\d{1,3})/i,
  proa: /(?:proa|heading)\s*(\d{2,3})/i,
  'nível': /(?:n[ií]vel|level|fl)\s*(\d{2,4})/i,
  transponder: /(?:transponder|squawk)\s*(\d{4})/i,
})

/** Campos que o Art. 12, III lista como objeto de cotejamento obrigatório. */
export const MANDATORY_FIELDS = Object.freeze(['pista', 'qnh', 'nível', 'proa', 'transponder', 'frequência'])

/**
 * Campos que **nunca** podem virar exigência de cotejamento, ainda que apareçam na fala do
 * controlador: são dados reportados (meteorologia e afins), sem previsão no Art. 12, III.
 * `vento` fica explícito aqui porque é o exemplo canônico de informação que o piloto recebe e não
 * repete — a lista existe para impedir que ele entre por engano em `obrigatorios`.
 */
export const NEVER_REQUIRED_FIELDS = Object.freeze(['vento', 'miles', 'milhas', 'temperatura', 'visibilidade', 'meteorologia', 'reporte', 'destino', 'destino ou setor'])

/** Valores operacionais reconhecíveis em uma fala (cotejamento e diálogo). */
export function operationalValues(text) {
  const normalized = String(text ?? '').toLocaleLowerCase('pt-BR').replace(',', '.')
  return Object.fromEntries(Object.entries(FIELD_PATTERNS).map(([key, pattern]) => [key, pattern.exec(normalized)?.[1]]).filter(([, value]) => value))
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

/**
 * Autorização pendente de cotejamento como objeto estruturado.
 *
 * `campos` é tudo que a autorização carrega; `obrigatorios` é só o que exige resposta;
 * `informativos` é o que o piloto reporta mas não é cobrado de volta.
 */
export function buildPendingAuthorization({ intent = null, fonteId = null, text = '', elements = [], citation = null } = {}) {
  const campos = operationalValues(text)
  const expected = { ...campos }
  for (const element of elements ?? []) {
    if (element?.name && element.value != null) expected[element.name] = expected[element.name] ?? String(element.value)
  }

  const roles = new Map((elements ?? []).filter((element) => element?.role && element?.value != null).map((element) => [element.name, element.role]))
  const comparable = Object.keys(expected).filter((name) => !NEVER_REQUIRED_FIELDS.includes(name))

  // Obrigatório = elemento de instrução tipado; sem elementos tipados, o padrão é o Art. 12, III
  // entre os campos realmente presentes na autorização.
  const obrigatorios = unique(comparable.filter((name) => (roles.has(name) ? roles.get(name) === 'instrucao' : MANDATORY_FIELDS.includes(name))))
  const informativos = unique(comparable.filter((name) => roles.get(name) === 'informacao' && !obrigatorios.includes(name)))

  return Object.freeze({
    intent,
    fonteId,
    citation,
    text,
    // `cotejada` é a única marca de ciclo de vida: a obrigação é `cotejamento_pendente` no
    // contexto da sessão; o objeto permanece para preservar os papéis depois da resposta.
    cotejada: false,
    campos,
    expected: Object.freeze(expected),
    obrigatorios: Object.freeze(obrigatorios),
    informativos: Object.freeze(informativos),
  })
}

/**
 * Avaliador consolidado: compara a autorização pendente com o texto cotejado.
 * Substitui os dois avaliadores divergentes anteriores (`evaluateReadback` por substring e
 * `evaluateReadbackSemantic` por regex sobre tudo que a frase continha).
 */
export function evaluateReadbackAgainstPending(pendente, cotejamento) {
  const pending = pendente ?? buildPendingAuthorization({})
  const expected = pending.expected ?? operationalValues(pending.text ?? '')
  const received = operationalValues(cotejamento)
  const obrigatorios = pending.obrigatorios ?? []
  if (!obrigatorios.length && !Object.keys(expected).length) {
    return { classification: 'ambiguous', correct: false, missing: [], contradictory: [], expected, received, obrigatorios: [], informativos: pending.informativos ?? [], omitidos: [], score: 100, pending }
  }
  // Falta: só incide sobre o que é obrigatório. Um informativo omitido não é erro.
  const missing = obrigatorios.filter((key) => !received[key])
  // Contradição: qualquer valor da autorização repetido com valor diferente — inclusive
  // informativo, porque o Art. 12, § 1º manda corrigir o que foi repetido errado.
  const contradictory = Object.keys(expected).filter((key) => received[key] && received[key] !== expected[key])
  const classification = contradictory.length ? 'contradictory' : missing.length ? 'incomplete' : 'correct'
  const wrong = contradictory.filter((key) => obrigatorios.includes(key)).length
  const score = obrigatorios.length ? Math.round(100 * (obrigatorios.length - missing.length - wrong) / obrigatorios.length) : 100
  return {
    classification, correct: classification === 'correct', missing, contradictory, expected, received,
    obrigatorios, informativos: pending.informativos ?? [],
    // Compatibilidade com `buildSessionReport` (erros recorrentes do relatório da sessão).
    omitidos: missing, score, pending,
  }
}

/**
 * Reconstrói a autorização pendente a partir do estado quando a sessão não guardou o objeto
 * (estados criados antes do F2 ou reidratados de um snapshot).
 */
export function pendingFromState(state) {
  const stored = state?.contexto?.autorizacao_pendente
  if (stored) return stored
  const text = state?.contexto?.ultima_autorizacao
  if (!text) return null
  return buildPendingAuthorization({ intent: state?.contexto?.ultima_intencao ?? null, text })
}
