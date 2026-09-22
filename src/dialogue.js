/**
 * Camada de diálogo (F1) — o que o PLANO_REF §4, §5 e §8 exigem e que não existia:
 * a conversa tem memória. Uma pergunta do controlador passa a ser **estado da sessão**, e a
 * comunicação seguinte é avaliada primeiro contra a expectativa pendente.
 *
 * Antes: `needs_clarification` retornava `stateUpdate: null` e nada era registrado; o turno
 * seguinte era interpretado do zero (A3.6). Sem isso, "reconhecer que a resposta não responde
 * à pergunta anterior" (§5) e "fogo em qual parte da aeronave?" (§8) eram impossíveis.
 *
 * Também resolve, pelo contexto, ambiguidades que o parser cria sozinho (A3.16): quando existe
 * autorização pendente de cotejamento e a fala traz um marcador documentado de cotejamento, a
 * comunicação é um cotejamento — independentemente de o léxico empatar com outra intenção.
 *
 * Vocabulário de cotejamento fundamentado no art. 39 (glossário `pt-en`): "COTEJE / READ BACK",
 * "ROGER"; e nas tabelas de fraseologia, onde "*Ciente, ..." é a forma padronizada de resposta.
 */
import { evidenceRule } from './knowledge/evidence-rules.js'
import { operationalValues } from './training.js'

export const DIALOGUE_ACT = Object.freeze({
  NORMAL: 'normal',
  READBACK: 'readback',
  EMERGENCY: 'emergency',
  ANSWER: 'answer',
  NEW_REQUEST: 'new_request',
  UNRELATED: 'unrelated',
})

export const READBACK_MARKERS = Object.freeze(['ciente', 'copiado', 'roger', 'wilco', 'cotej', 'readback', 'read back'])
/** Marcadores de que o piloto está perguntando algo ao controlador, não respondendo. */
const REQUEST_MARKERS = Object.freeze(['confirme', 'confirm'])
/**
 * Marcadores de que o piloto está **solicitando** uma autorização nova. Diferencia cotejamento
 * (repetição do que foi recebido) de nova solicitação, mesmo quando o léxico das duas coincide.
 */
const SOLICITATION_MARKERS = Object.freeze(['solicit', 'request', 'pronto', 'ready', 'gostaria', 'desejo', 'necessit', 'pretend', 'requeiro'])
const NEW_REQUEST_CONFIDENCE = 0.6

const FOLD = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')

export function readPendingQuestion(state) {
  return state?.contexto?.pergunta_pendente ?? null
}

/** Registra a pergunta do controlador como estado, com o vocabulário documentado que a responde. */
export function createPendingQuestion({ requirement, intent, citation }) {
  if (!requirement?.field) throw new TypeError('pergunta pendente exige um campo solicitado.')
  return Object.freeze({
    kind: 'information',
    field: requirement.field,
    intent,
    question: requirement.question,
    citation: citation ?? null,
    detect: [...(requirement.detect ?? [])],
    fromInterpretation: requirement.fromInterpretation ?? null,
    sessionField: requirement.sessionField ?? null,
  })
}

/**
 * Atualização de estado da pergunta pendente, no formato que `applyStateUpdate` aceita
 * (`contexto.pergunta_pendente` é o campo da lista fechada). Devolver a chave no nível de cima
 * fazia o estado ignorá-la em silêncio e a memória do diálogo nunca engatava.
 */
export function pendingContextUpdate(pending) {
  return { contexto: { pergunta_pendente: pending ?? null } }
}

function echoesClearance(text, clearance) {
  const spoken = operationalValues(text)
  const expected = operationalValues(clearance)
  return Object.keys(expected).some((key) => spoken[key] && spoken[key] === expected[key])
}

function answersPending(pending, { interpretation, text, state }) {
  const folded = FOLD(text)
  if ((pending.detect ?? []).some((term) => folded.includes(FOLD(term)))) return true
  if (pending.fromInterpretation && interpretation?.[pending.fromInterpretation]) return true
  if (pending.sessionField && state?.contexto?.[pending.sessionField]) return true
  return false
}

function isDocumentedRequest(interpretation) {
  if (!interpretation) return false
  if (interpretation.intent === 'unknown' || interpretation.intent === 'ambiguous') return false
  if (!evidenceRule(interpretation.intent)) return false
  return (interpretation.confidence ?? 0) >= NEW_REQUEST_CONFIDENCE
}

/**
 * Classifica o ato de diálogo da comunicação atual no contexto da sessão.
 * Precedência (testável, ver `test/dialogue-state.test.js`):
 * 1. cotejamento, quando há autorização a cotejar e a fala traz marcador documentado;
 * 2. emergência (sempre assume a conversa, exceto se a fala for o próprio cotejamento);
 * 3. resposta à pergunta pendente;
 * 4. nova solicitação operacional documentada;
 * 5. comunicação incompatível: permanece no contexto e o controlador reformula o pedido.
 */
/**
 * Resolve a interpretação **no contexto** antes de qualquer recuperação.
 *
 * Isto precisa acontecer antes da busca: se a comunicação é um cotejamento, a consulta de
 * recuperação é a do cotejamento, não a do léxico que empatou (A3.16). Resolver depois fazia
 * a evidência recuperada ser a da interpretação antiga, e um cotejamento válido terminava
 * "sem base documental recuperada".
 */
export function resolveDialogueInterpretation(interpretation, { state, text }) {
  const dialogue = evaluateDialogue({ interpretation, state, text })
  const effective = dialogue.act === DIALOGUE_ACT.READBACK && interpretation && interpretation.intent !== 'readback'
    ? { ...interpretation, rawIntent: interpretation.intent, intent: 'readback', readback: true }
    : interpretation
  return { interpretation: effective, dialogue }
}

export function evaluateDialogue({ interpretation, state, text }) {
  const pending = readPendingQuestion(state)
  const folded = FOLD(text)
  const clearance = state?.contexto?.ultima_autorizacao
  const lastIntent = state?.contexto?.ultima_intencao
  const hasMarker = READBACK_MARKERS.some((marker) => folded.includes(FOLD(marker)))
  const solicits = SOLICITATION_MARKERS.some((marker) => folded.includes(FOLD(marker)))
  // Cotejamento é repetição do que foi recebido: exige marcador documentado, uma autorização a
  // cotejar e nenhuma solicitação nova — e precisa ecoar um valor da autorização, ser a própria
  // intenção de cotejamento, ou repetir o assunto da última instrução (A3.15, A3.16).
  const repeatsClearance = Boolean(clearance) && (
    echoesClearance(text, clearance)
    || interpretation?.intent === 'readback'
    || interpretation?.intent === 'ambiguous'
    || (Boolean(lastIntent) && interpretation?.intent === lastIntent)
  )
  // Cotejamento exige item cotejável: o art. 12 III obriga a repetir pista em uso, ajuste de
  // altímetro, código SSR, nível/altitude, proa, velocidade ou frequência — os itens que a
  // autorização contém. Uma autorização sem nenhum deles (ex.: "troca de frequência aprovada",
  // fraseologia do art. 59, sem valor) não tem o que cotejar: repeti-la é um reconhecimento, e
  // ele segue o caminho normal da sua própria fraseologia documentada.
  const cotejavel = Boolean(clearance) && Object.keys(operationalValues(clearance)).length > 0
  const isReadback = cotejavel && hasMarker && !solicits && repeatsClearance

  if (isReadback) return { act: DIALOGUE_ACT.READBACK, pending, preempts: true }
  if (interpretation?.emergency) return { act: DIALOGUE_ACT.EMERGENCY, pending, preempts: true }
  if (REQUEST_MARKERS.some((marker) => folded.includes(marker))) return { act: pending ? DIALOGUE_ACT.UNRELATED : DIALOGUE_ACT.NORMAL, pending, preempts: false }
  if (pending && answersPending(pending, { interpretation, text, state })) return { act: DIALOGUE_ACT.ANSWER, pending, preempts: true }
  if (pending && isDocumentedRequest(interpretation)) return { act: DIALOGUE_ACT.NEW_REQUEST, pending, preempts: true }
  if (pending) return { act: DIALOGUE_ACT.UNRELATED, pending, preempts: false }
  return { act: DIALOGUE_ACT.NORMAL, pending: null, preempts: false }
}
