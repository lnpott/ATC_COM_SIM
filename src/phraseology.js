/**
 * Realização linguística (F1) — a fala do controlador, separada da decisão operacional.
 *
 * Cada realização declara a **citação documental** que a fundamenta e devolve `elements`
 * tipados (`instrucao` | `informacao` | `pergunta`) em vez de só texto. Isso permite que a
 * próxima camada (cotejamento, F2) saiba o que a autorização carrega e qual a natureza de cada
 * elemento, sem voltar a interpretar a frase pronta.
 *
 * Regra: nenhuma frase aqui pode afirmar, autorizar ou instruir algo sem fundamento no artigo
 * citado. Textos que já existiam foram preservados sem alteração; as exceções deliberadas são
 * (a) a variante de **fogo a bordo**, antes inalcançável (A3.3), com o vocabulário bilíngue da
 * Tabela 15 (art. 43: "Fogo a bordo / Fire on board"), e (b) o cotejamento correto em inglês,
 * que passa a usar a fraseologia documentada do art. 138 ("your read back is correct").
 */

const L = (language, pt, en) => (language === 'en' ? en : pt)
const callsignOf = (state) => state.aeronave.indicativo
const runwayOf = (state) => state.cenario.pista_em_uso
const qnhOf = (state) => state.cenario.qnh

export const REALIZATIONS = Object.freeze({
  taxi_clearance: {
    citation: 'MCA 100-16, Art. 125',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, autorizado táxi para o ponto de espera da pista ${runwayOf(state)}, QNH ${qnhOf(state)}.`,
        `${callsignOf(state)}, taxi to holding point runway ${runwayOf(state)}, QNH ${qnhOf(state)}.`),
      elements: [
        { name: 'pista', value: runwayOf(state), role: 'instrucao' },
        { name: 'qnh', value: String(qnhOf(state)), role: 'informacao' },
      ],
    }),
  },

  takeoff_clearance: {
    citation: 'MCA 100-16, Art. 126',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, pista ${runwayOf(state)}, decolagem autorizada.`,
        `${callsignOf(state)}, runway ${runwayOf(state)}, cleared for take-off.`),
      elements: [{ name: 'pista', value: runwayOf(state), role: 'instrucao' }],
    }),
  },

  circuit_clearance: {
    citation: 'MCA 100-16, Art. 129',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, autorizado ingresso no circuito de tráfego da pista ${runwayOf(state)}, QNH ${qnhOf(state)}.`,
        `${callsignOf(state)}, cleared to join the traffic pattern runway ${runwayOf(state)}, QNH ${qnhOf(state)}.`),
      elements: [
        { name: 'pista', value: runwayOf(state), role: 'instrucao' },
        { name: 'qnh', value: String(qnhOf(state)), role: 'informacao' },
      ],
    }),
  },

  approach_clearance: {
    citation: 'MCA 100-16, Art. 114',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, autorizado aproximação pista ${runwayOf(state)}.`,
        `${callsignOf(state)}, cleared approach runway ${runwayOf(state)}.`),
      elements: [{ name: 'pista', value: runwayOf(state), role: 'instrucao' }],
    }),
  },

  landing_clearance: {
    citation: 'MCA 100-16, Art. 132',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, pista ${runwayOf(state)}, pouso autorizado.`,
        `${callsignOf(state)}, runway ${runwayOf(state)}, cleared to land.`),
      elements: [{ name: 'pista', value: runwayOf(state), role: 'instrucao' }],
    }),
  },

  emergency_engine: {
    citation: 'MCA 100-16, Art. 64',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, ciente Mayday, pista ${runwayOf(state)} disponível, reporte posição.`,
        `${callsignOf(state)}, roger Mayday, runway ${runwayOf(state)} available, report position.`),
      elements: [
        { name: 'pista', value: runwayOf(state), role: 'informacao' },
        { name: 'reporte', value: 'posição', role: 'informacao' },
      ],
    }),
  },

  emergency_fire: {
    citation: 'MCA 100-16, Art. 66 e Art. 43 (Tabela 15: "Fogo a bordo / Fire on board")',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, ciente, fogo a bordo, pista ${runwayOf(state)} disponível, reporte posição.`,
        `${callsignOf(state)}, roger, fire on board, runway ${runwayOf(state)} available, report position.`),
      elements: [
        { name: 'pista', value: runwayOf(state), role: 'informacao' },
        { name: 'reporte', value: 'posição', role: 'informacao' },
      ],
    }),
  },

  emergency_urgency: {
    citation: 'MCA 100-16, Art. 43 (Tabela 15) e Art. 64',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, ciente Pan Pan, pista ${runwayOf(state)} disponível, reporte posição.`,
        `${callsignOf(state)}, roger Pan Pan, runway ${runwayOf(state)} available, report position.`),
      elements: [
        { name: 'pista', value: runwayOf(state), role: 'informacao' },
        { name: 'reporte', value: 'posição', role: 'informacao' },
      ],
    }),
  },

  frequency_approval: {
    citation: 'MCA 100-16, Art. 59',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, mudança de frequência aprovada.`,
        `${callsignOf(state)}, frequency change approved.`),
      elements: [],
    }),
  },

  vfr_departure_clearance: {
    citation: 'MCA 100-16, Art. 122',
    build: ({ language, state, destination }) => ({
      text: L(language,
        `${callsignOf(state)}, saída VFR para ${destination}, pista ${runwayOf(state)}, QNH ${qnhOf(state)}.`,
        `${callsignOf(state)}, VFR departure toward ${destination}, runway ${runwayOf(state)}, QNH ${qnhOf(state)}.`),
      elements: [
        { name: 'destino', value: destination, role: 'informacao' },
        { name: 'pista', value: runwayOf(state), role: 'instrucao' },
        { name: 'qnh', value: String(qnhOf(state)), role: 'informacao' },
      ],
    }),
  },

  /**
   * Cotejamento incorreto/incompleto. O art. 12, § 1º documenta a resposta exata: a palavra
   * "negativo", seguida da **versão correta**. Antes o controlador dizia "Cotejamento
   * incompleto; confirme ..." — fraseologia inexistente no manual, que devolvia ao piloto a
   * tarefa de descobrir o valor correto.
   */
  readback_incorrect: {
    citation: 'MCA 100-16, Art. 12, § 1º ("negativo" seguida da versão correta) e Art. 39 (NEGATIVO / NEGATIVE)',
    build: ({ language, state, items = [] }) => {
      const labels = {
        pt: { pista: 'pista', qnh: 'QNH', 'frequência': 'frequência', proa: 'proa', 'nível': 'nível', transponder: 'transponder' },
        en: { pista: 'runway', qnh: 'QNH', 'frequência': 'frequency', proa: 'heading', 'nível': 'level', transponder: 'squawk' },
      }
      const table = labels[language === 'en' ? 'en' : 'pt']
      const correct = items.map(({ key, value }) => `${table[key] ?? key} ${value}`).join(', ')
      return {
        text: L(language,
          `${callsignOf(state)}, negativo${correct ? `, ${correct}` : ''}.`,
          `${callsignOf(state)}, negative${correct ? `, ${correct}` : ''}.`),
        elements: items.map(({ key, value }) => ({ name: key, value: String(value), role: 'instrucao' })),
      }
    },
  },

  readback_correct: {
    citation: 'MCA 100-16, Art. 12, III e Art. 138 ("cotejamento correto / your read back is correct")',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, cotejamento correto.`,
        `${callsignOf(state)}, your read back is correct.`),
      elements: [],
    }),
  },

  acknowledge: {
    citation: 'MCA 100-16, Art. 39 (ROGER — "Recebi toda sua última transmissão")',
    build: ({ language, state }) => ({
      text: L(language, `${callsignOf(state)}, ciente.`, `${callsignOf(state)}, roger.`),
      elements: [],
    }),
  },

  // Perguntas do controlador. O conteúdo é vocabulário documentado, não procedimento novo:
  // "confirme/confirm" vem do art. 39 (CONFIRME / CONFIRM) e as partes da aeronave vêm da
  // Tabela 15 do art. 43 ("Fogo no porão / Fire in the hold", "Fogo no toalete / Fire in the
  // lavatory", "Fogo no compartimento de trem de pouso / Wheel-well fire", "Pane de motor").
  emergency_fire_location: {
    citation: 'MCA 100-16, Art. 39 (CONFIRME / CONFIRM) e Art. 43 (Tabela 15)',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, confirme em que parte da aeronave está o fogo: porão, toalete, trem de pouso ou motor.`,
        `${callsignOf(state)}, confirm which part of the aircraft is on fire: hold, lavatory, landing gear or engine.`),
      elements: [
        { name: 'parte da aeronave', value: 'porão, toalete, trem de pouso, motor', role: 'pergunta' },
      ],
    }),
  },

  vfr_destination: {
    citation: 'MCA 100-16, Art. 39 (CONFIRME / CONFIRM) e Art. 122',
    build: ({ language, state }) => ({
      text: L(language,
        `${callsignOf(state)}, confirme o destino ou setor desejado.`,
        `${callsignOf(state)}, confirm the destination or sector requested.`),
      elements: [{ name: 'destino ou setor', value: null, role: 'pergunta' }],
    }),
  },
})

/**
 * Compõe a fala. Lança se a realização não existe ou se um elemento de instrução não tiver
 * fonte documental — a mesma regra de ouro, aplicada no momento da geração.
 */
export function compose(realizationId, context) {
  const realization = REALIZATIONS[realizationId]
  if (!realization) throw new TypeError(`realização desconhecida: ${realizationId}`)
  if (!realization.citation) throw new TypeError(`realização sem citação documental: ${realizationId}`)
  const built = realization.build(context)
  if (!built?.text) throw new TypeError(`realização vazia: ${realizationId}`)
  const sourceId = context.sourceId ?? null
  const elements = (built.elements ?? []).map((element) => ({ ...element, sourceId }))
  const unsourcedInstruction = elements.find(({ role, sourceId: id }) => role === 'instrucao' && !id)
  if (unsourcedInstruction) throw new Error(`elemento de instrução sem fonte documental: ${unsourcedInstruction.name}`)
  return { text: built.text, elements, citation: realization.citation }
}
