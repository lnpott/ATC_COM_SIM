/**
 * Camada de diálogo (F1) — a conversa com memória, exigida pelos §4, §5 e §8 do PLANO_REF.
 *
 * Estes testes afirmam COMPORTAMENTO, não texto: cada caso cita o artigo que fundamenta a
 * decisão. A matriz normativa completa é o entregável do F3; aqui fica o que o F1 introduz.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { DIALOGUE_ACT, evaluateDialogue, readPendingQuestion, resolveDialogueInterpretation } from '../src/dialogue.js'
import { compose } from '../src/phraseology.js'
import { processTransmission } from '../src/pipeline.js'
import { ManualSearch } from '../src/search.js'
import { getScenario } from '../src/scenarios.js'
import { applyStateUpdate, createSimulationState } from '../src/state-machine.js'

const search = await ManualSearch.load()

function stateFor(scenarioId = 'vfr_local_pt', fase) {
  const scenario = getScenario(scenarioId)
  if (fase) scenario.fase = fase
  return createSimulationState(scenario)
}

/** Executa um turno e devolve o estado já atualizado, como o navegador faz. */
function say(state, text, { idioma = 'pt', scenarioId = 'vfr_local_pt', fase } = {}) {
  const result = processTransmission({ text, idioma, state, search })
  const next = result.decision.stateUpdate ? applyStateUpdate(state, result.decision.stateUpdate) : state
  return { ...result, state: next, decision: result.decision }
}

test('a pergunta do controlador vira estado da sessão e a resposta seguinte é reconhecida', () => {
  const initial = stateFor()
  const question = say(initial, 'PT-ABC pretende saída VFR')

  assert.equal(question.decision.status, 'needs_clarification')
  assert.equal(question.decision.reason, 'missing:destino ou setor')
  assert.equal(question.decision.pendingQuestion.field, 'destino ou setor')
  // A pergunta carrega a citação da fraseologia que a realiza (art. 39 CONFIRME / art. 122).
  assert.match(question.decision.pendingQuestion.citation, /Art\. 39/)
  assert.equal(readPendingQuestion(initial), null, 'a sessão anterior não herda a pergunta')
  assert.equal(readPendingQuestion(question.state).field, 'destino ou setor')

  const answer = say(question.state, 'VFR saída para o setor norte')
  assert.equal(answer.decision.dialogueAct, DIALOGUE_ACT.ANSWER)
  assert.equal(answer.decision.status, 'documented')
  assert.deepEqual(answer.decision.sourceIds, ['MCA-100-16-artigo-0122-001'])
  assert.equal(readPendingQuestion(answer.state), null, 'a pergunta pendente é encerrada quando respondida')
})

test('comunicação que não responde à pergunta pendente é reconhecida e o controlador reformula', () => {
  const question = say(stateFor(), 'PT-ABC pretende saída VFR')
  const offTopic = say(question.state, 'Uma cerveja e um cigarro.')

  assert.equal(offTopic.decision.dialogueAct, DIALOGUE_ACT.UNRELATED)
  assert.equal(offTopic.decision.reason, 'pending-question:destino ou setor')
  assert.equal(offTopic.decision.spokenText, question.decision.spokenText, 'reformula a mesma pergunta documentada')
  assert.equal(readPendingQuestion(offTopic.state).field, 'destino ou setor', 'a pergunta continua pendente')
})

test('declaração de fogo sem local gera a pergunta documentada e a resposta alcança o art. 66', () => {
  const initial = stateFor('vfr_local_pt', 'rota')
  const fire = say(initial, 'Estamos com fogo aqui.')

  assert.equal(fire.interpretation.intent, 'emergency')
  assert.equal(fire.decision.status, 'needs_clarification')
  assert.equal(fire.decision.reason, 'missing:parte da aeronave')
  // A pergunta é vocabulário documentado: CONFIRME (art. 39) + partes da aeronave (art. 43, Tab. 15).
  assert.match(fire.decision.spokenText, /parte da aeronave/)
  assert.match(fire.decision.pendingQuestion.citation, /Art\. 43/)

  const located = say(fire.state, 'Fogo no motor direito.')
  assert.equal(located.decision.status, 'documented')
  // Art. 66 (fogo e fumaça a bordo) + art. 43 (Tabela 15), e não o art. 64 de pane de motor.
  assert.deepEqual(located.decision.sourceIds, ['MCA-100-16-artigo-0066-001', 'MCA-100-16-artigo-0043-001'])
  assert.ok(located.decision.sourceIds.every((id) => located.retrieval.expanded.some((item) => item.id === id)))
})

test('emergência assume a conversa mesmo com pergunta pendente de outro assunto', () => {
  const question = say(stateFor(), 'PT-ABC pretende saída VFR')
  const mayday = say(question.state, 'Mayday, Mayday, Mayday, PT-ABC, falha de motor')

  assert.equal(mayday.decision.dialogueAct, DIALOGUE_ACT.EMERGENCY)
  assert.equal(mayday.decision.status, 'documented')
  assert.deepEqual(mayday.decision.sourceIds, ['MCA-100-16-artigo-0064-001'])
})

test('o contexto resolve a interpretação antes da recuperação: cotejamento busca como cotejamento', () => {
  const taxi = say(stateFor(), 'Solo Galeão, PT-ABC, solicito instruções de táxi')
  const circuit = say(taxi.state, 'Torre, PT-ABC cinco milhas ao sul, solicito ingresso no circuito')
  const readback = say(circuit.state, 'Ciente, ingresso no circuito pista 18')

  // O léxico sozinho classificaria a fala como ambígua; o contexto (autorização a cotejar + marcador
  // documentado do art. 39) resolve, e a consulta de recuperação passa a ser a do cotejamento.
  assert.equal(readback.decision.dialogueAct, DIALOGUE_ACT.READBACK)
  assert.equal(readback.interpretation.intent, 'readback')
  assert.equal(readback.decision.status, 'needs_clarification')
  assert.equal(readback.decision.reason, 'readback:incomplete')
  assert.deepEqual(readback.decision.sourceIds, ['MCA-100-16-artigo-0012-001'])
  // Art. 12, § 1º: "negativo", seguido da versão correta — não uma pergunta de volta ao piloto.
  assert.match(readback.decision.spokenText, /negativo, QNH 1015/)
})

test('autorização sem item cotejável não é cotejamento (art. 12, III)', () => {
  const approval = say(stateFor('ifr_partida_pt', 'rota'), 'Controle Brasília, PR-IFR, solicito mudança de frequência')
  assert.equal(approval.decision.status, 'documented')

  const echo = say(approval.state, 'Ciente, mudança de frequência aprovada')
  // A fraseologia documentada do art. 59 ("troca de frequência aprovada") não carrega nenhum dos
  // itens do art. 12, III: não há o que cotejar, e a fala segue o caminho normal da sua intenção.
  assert.notEqual(echo.decision.dialogueAct, DIALOGUE_ACT.READBACK)
  assert.equal(echo.decision.status, 'documented')
  assert.deepEqual(echo.decision.sourceIds, ['MCA-100-16-artigo-0059-001'])
})

test('a resolução do contexto é idempotente e explícita', () => {
  const state = stateFor()
  const interpretation = { intent: 'taxi_request', confidence: 0.9, rawText: 'solicito instruções de táxi' }

  const { interpretation: effective, dialogue } = resolveDialogueInterpretation(interpretation, { state, text: interpretation.rawText })
  assert.equal(dialogue.act, DIALOGUE_ACT.NORMAL)
  assert.equal(effective, interpretation, 'sem contexto aplicável, a interpretação não é reescrita')
  assert.equal(evaluateDialogue({ interpretation, state, text: interpretation.rawText }).act, DIALOGUE_ACT.NORMAL)
})

test('nenhuma fala do controlador existe sem citação, e instrução exige fonte recuperada', () => {
  const state = stateFor()

  /** Toda realização composta carrega citação documental. */
  for (const [id, extra] of [
    ['taxi_clearance', {}],
    ['circuit_clearance', {}],
    ['readback_correct', {}],
    ['acknowledge', {}],
    ['vfr_destination', {}],
    ['readback_incorrect', { items: [{ key: 'qnh', value: '1015' }] }],
  ]) {
    const composed = compose(id, { language: 'pt', state, sourceId: 'MCA-100-16-artigo-0125-001', ...extra })
    assert.match(composed.citation, /MCA 100-16/, id)
    assert.ok(composed.text.includes(state.aeronave.indicativo), id)
  }

  // Regra de ouro na geração: elemento de instrução sem fonte recuperada não pode ser falado.
  assert.throws(() => compose('readback_incorrect', { language: 'pt', state, items: [{ key: 'qnh', value: '1015' }] }), /fonte documental/)
  assert.throws(() => compose('realizacao_inexistente', { language: 'pt', state }), /desconhecida/)
})
