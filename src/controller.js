/**
 * Controlador (F1) — orquestrador determinístico da resposta do controlador.
 *
 * Ordem de execução, espelhando o pipeline desejado no §19 do PLANO_REF:
 *
 *   interpretação → diálogo (estado/expec tativa) → conhecimento (cobertura documental)
 *   → decisão operacional → realização linguística → atualização validada de estado
 *
 * O LLM participa apenas da interpretação. A decisão vem da documentação recuperada e a
 * realização reproduz fraseologia citada; nenhuma das duas inventa procedimento.
 *
 * Mudanças de F1 em relação ao controlador anterior:
 * - deixa de existir `SOURCE_BY_INTENT` (intent → artigo único fixo): a cobertura é resolvida
 *   por variante documentada em `src/knowledge/`;
 * - `missingOperationalInformation` deixa de ser descartado: informação que falta vira pergunta
 *   registrada no estado (`pergunta_pendente`), e a comunicação seguinte é avaliada contra ela;
 * - o texto falado passa a vir de `src/phraseology.js`, com citação documental por realização;
 * - a taxonomia de cobertura substitui o antigo `unsupported`, que afirmava ausência de cobertura
 *   no manual mesmo quando o artigo existia (A3.1).
 */
import { interpretTransmission } from './transmission.js'
import { evaluateReadbackSemantic } from './training.js'
import { COVERAGE, formulateSearch, resolveCoverage } from './knowledge.js'
import { DIALOGUE_ACT, createPendingQuestion, evaluateDialogue, pendingContextUpdate } from './dialogue.js'
import { compose } from './phraseology.js'

const INTENTS = [
  { name: 'emergencia', terms: ['mayday', 'pan pan', 'emergência', 'emergency', 'falha de motor'], source: 'MCA-100-16-artigo-0064-001' },
  { name: 'taxi', terms: ['táxi', 'taxi'], source: 'MCA-100-16-artigo-0125-001' },
  { name: 'decolagem', terms: ['decolagem', 'partida', 'departure', 'take-off'], source: 'MCA-100-16-artigo-0126-001' },
  { name: 'aproximacao', terms: ['aproximação', 'aproximacao', 'approach', 'ils'], source: 'MCA-100-16-artigo-0114-001' },
  { name: 'pouso', terms: ['pouso', 'landing', 'final'], source: 'MCA-100-16-artigo-0132-001' },
]

const LEGACY_NAMES = { taxi: 'taxi_request', decolagem: 'takeoff_request', aproximacao: 'approach_request', pouso: 'landing_request', emergencia: 'emergency' }

/** Detecção lexical legada. Mantida apenas para comparação histórica e para o caminho sem interpretação. */
export function detectIntent(text) {
  const normalized = text.toLocaleLowerCase('pt-BR')
  return INTENTS.find(({ terms }) => terms.some((term) => normalized.includes(term))) ?? null
}

export function searchPhaseForIntent(intent, currentPhase) {
  return ({ taxi: 'solo', decolagem: 'decolagem', aproximacao: 'aproximacao', pouso: 'pouso', emergencia: 'emergencia' })[intent?.name] ?? currentPhase
}

export function createGroundedControllerReply(input) {
  return decideGroundedReply(input)
}

function missingInformationReply({ language, requirement, state, intent }) {
  const composed = compose(requirement.question, { language, state })
  const pending = createPendingQuestion({ requirement, intent, citation: composed.citation })
  return {
    covered: false,
    status: COVERAGE.NEEDS_CLARIFICATION,
    reason: `missing:${requirement.field}`,
    spokenText: composed.text,
    sourceIds: [],
    stateUpdate: pendingContextUpdate(pending),
    source: null,
    pendingQuestion: pending,
  }
}

/**
 * Comunicação incompatível com a pergunta pendente (§5): o controlador permanece no contexto e
 * reformula o pedido — não trata a fala como solicitação nova só porque contém palavras
 * compreensíveis, e não finge que ela respondeu.
 */
function pendingQuestionReply({ language, pending, state }) {
  const composed = compose(pending.question, { language, state })
  return {
    covered: false,
    status: COVERAGE.NEEDS_CLARIFICATION,
    reason: `pending-question:${pending.field}`,
    spokenText: composed.text,
    sourceIds: pending.sources ?? [],
    stateUpdate: pendingContextUpdate(pending),
    source: null,
    pendingQuestion: pending,
  }
}

function unfilledReply({ status, reason, language, coverage }) {
  const messages = {
    'controller-frequency-not-configured': language === 'en' ? 'Transfer frequency is not configured for this scenario; remain on this frequency.' : 'A frequência de transferência não está configurada para este cenário; mantenha esta frequência.',
    'readback-without-clearance': language === 'en' ? 'There is no clearance pending readback in this session.' : 'Não há autorização pendente de cotejamento nesta sessão.',
    'missing-session-context': coverage.message?.[language] ?? coverage.message?.pt ?? 'Dado de sessão indisponível.',
    'external-source-not-integrated': language === 'en'
      ? 'That information depends on an external source (METAR or weather service) that is not integrated yet; I will not improvise the data.'
      : 'Essa informação depende de fonte externa (METAR ou serviço meteorológico) que ainda não está integrada; não vou improvisar o dado.',
    'family-not-implemented': language === 'en'
      ? 'This situation is not implemented in the simulator yet; I will not improvise a procedure.'
      : 'Esta situação ainda não está implementada no simulador; não vou improvisar procedimento.',
    'no-evidence-rule': language === 'en'
      ? 'This situation is not implemented in the simulator yet; I will not improvise a procedure.'
      : 'Esta situação ainda não está implementada no simulador; não vou improvisar procedimento.',
    'evidence-not-recovered': language === 'en'
      ? 'There is not enough recovered documentary basis to answer that safely.'
      : 'Não há base documental recuperada suficiente para responder isso com segurança.',
  }
  return {
    covered: false,
    status,
    reason,
    spokenText: coverage.message?.[language] ?? coverage.message?.pt ?? messages[reason] ?? messages['evidence-not-recovered'],
    sourceIds: [],
    stateUpdate: null,
    source: null,
  }
}

export function decideGroundedReply({ text, idioma, state, searchResults, interpretation, plan: suppliedPlan }) {
  const language = idioma === 'en' || idioma === 'en-US' ? 'en' : 'pt'
  const evidence = (searchResults ?? []).filter(({ score }) => score > 0)
  const legacy = detectIntent(text)
  const understood = interpretation ?? (legacy ? { intent: LEGACY_NAMES[legacy.name], confidence: 1 } : interpretTransmission(text, { idioma, state }))

  const dialogue = evaluateDialogue({ interpretation: understood, state, text })
  // O contexto resolve a ambiguidade do léxico: se há autorização a cotejar e a fala traz
  // marcador documentado de cotejamento, a comunicação é um cotejamento (A3.16).
  const effective = dialogue.act === DIALOGUE_ACT.READBACK && understood.intent !== 'readback'
    ? { ...understood, intent: 'readback', readback: true }
    : understood
  const plan = suppliedPlan && suppliedPlan.intent === effective.intent ? suppliedPlan : formulateSearch(effective, state)
  const withDialogue = (reply) => ({ ...reply, interpretation: effective, dialogueAct: dialogue.act, plan })

  if (dialogue.act === DIALOGUE_ACT.UNRELATED && dialogue.pending) {
    return withDialogue(pendingQuestionReply({ language, pending: dialogue.pending, state }))
  }

  const coverage = resolveCoverage({ interpretation: effective, state, evidence, plan })

  if (coverage.status === COVERAGE.NOT_UNDERSTOOD) {
    return withDialogue({
      covered: false, status: COVERAGE.NOT_UNDERSTOOD, reason: 'intent-not-understood',
      spokenText: language === 'en' ? 'I did not understand your operational request. Say your intentions.' : 'Não entendi sua solicitação operacional. Informe suas intenções.',
      sourceIds: [], stateUpdate: null, source: null, coverage,
    })
  }

  if (coverage.status !== COVERAGE.DEMONSTRATED) {
    if (coverage.status === COVERAGE.NEEDS_CLARIFICATION) {
      return withDialogue({
        ...missingInformationReply({ language, requirement: coverage.requirement, state, intent: effective.intent }),
        coverage,
      })
    }
    return withDialogue({ ...unfilledReply({ status: coverage.status, reason: coverage.reason, language, coverage }), coverage })
  }

  // Cotejamento: avaliação segue a de F2 (arts. 12 § 1º e § 2º e art. 45). Aqui apenas roteia.
  if (effective.intent === 'readback') {
    const assessment = evaluateReadbackSemantic({ autorizacao: state?.contexto?.ultima_autorizacao, cotejamento: text })
    if (!assessment.correct) {
      // Art. 12, § 1º: cotejamento incorreto → "negativo" seguido da versão correta. O estado NÃO
      // é atualizado: a obrigação de cotejar a autorização original continua pendente até que
      // ela seja repetida corretamente.
      const items = [...assessment.missing, ...assessment.contradictory].map((key) => ({ key, value: assessment.expected[key] }))
      const corrected = compose('readback_incorrect', { language, state, sourceId: coverage.sources[0], items })
      return withDialogue({
        covered: true, status: COVERAGE.NEEDS_CLARIFICATION, reason: `readback:${assessment.classification}`,
        spokenText: corrected.text, sourceIds: coverage.sources, stateUpdate: null, source: null,
        coverage, readbackAssessment: assessment, elements: corrected.elements,
      })
    }
  }

  const composed = compose(coverage.variant.realization, {
    language, state, sourceId: coverage.sources[0],
    destination: effective.destination ?? state?.contexto?.destino,
  })
  const spokenText = composed.text
  const stateUpdate = buildStateUpdate({ effective, state, spokenText })
  return withDialogue({
    covered: true, status: COVERAGE.DEMONSTRATED, reason: 'grounded',
    spokenText, sourceIds: coverage.sources,
    source: evidence.find(({ id }) => id === coverage.sources[0]) ?? evidence[0] ?? null,
    stateUpdate, coverage, elements: composed.elements,
  })
}

function contextUpdate(interpretation) {
  const update = { contexto: Object.fromEntries(Object.entries({ atis: interpretation.atis, regras_voo: interpretation.flightRules, destino: interpretation.destination, ultima_intencao: interpretation.intent }).filter(([, value]) => value !== undefined)) }
  if (interpretation.position) update.aeronave = { posicao: interpretation.position }
  return update
}

/**
 * Atualização de estado validada. A tabela de transições de fase/frequência é preservada como
 * estava (F2 revisa as transições sem documentação, ver A3.17). O que F1 acrescenta é o ciclo de
 * vida da pergunta pendente: ela é encerrada sempre que a comunicação foi tratada.
 */
function buildStateUpdate({ effective, state, spokenText }) {
  const context = contextUpdate(effective)
  const transitions = {
    taxi_request: context,
    takeoff_request: state.fase === 'solo' ? { fase: 'decolagem', frequencia: 'torre', contexto: context.contexto } : context,
    traffic_circuit: ['decolagem', 'rota'].includes(state.fase) ? { fase: 'aproximacao', frequencia: 'torre', contexto: context.contexto } : context,
    approach_request: ['decolagem', 'rota'].includes(state.fase) ? { fase: 'aproximacao', frequencia: 'aproximacao', contexto: context.contexto } : context,
    landing_request: state.fase === 'aproximacao' ? { fase: 'pouso', frequencia: 'torre', contexto: context.contexto } : context,
    emergency: context,
    frequency_change: context,
    vfr_departure: context,
    readback: context,
    position_report: context,
    unable: context,
  }
  const update = transitions[effective.intent] ?? context
  update.contexto = {
    ...(update.contexto ?? {}),
    ultima_autorizacao: spokenText,
    ultima_instrucao_controlador: spokenText,
    ultima_intencao: effective.intent,
    cotejamento_pendente: effective.intent !== 'readback',
    emergencia_ativa: effective.intent === 'emergency' || state.contexto?.emergencia_ativa === true,
    ...pendingContextUpdate(null).contexto,
  }
  return update
}
