/**
 * Taxonomia de cobertura documental (F1, PLANO_REF §9) e conhecimento por predicado (§7).
 *
 * O que este arquivo impede de voltar:
 * - "sem cobertura" dito quando o corpus tem o artigo (A3.1);
 * - um intent apontando para um único artigo fixo, tornando invisível o conhecimento que está
 *   em outro lugar do manual (A3.3);
 * - falar sobre fonte que o BM25 não recuperou.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { COVERAGE } from '../src/knowledge.js'
import { processTransmission } from '../src/pipeline.js'
import { ManualSearch } from '../src/search.js'
import { getScenario } from '../src/scenarios.js'
import { createSimulationState } from '../src/state-machine.js'

const search = await ManualSearch.load()

function stateFor(scenarioId = 'vfr_local_pt', fase) {
  const scenario = getScenario(scenarioId)
  if (fase) scenario.fase = fase
  return createSimulationState(scenario)
}

const decide = (text, { idioma = 'pt', scenarioId = 'vfr_local_pt', fase } = {}) =>
  processTransmission({ text, idioma, state: stateFor(scenarioId, fase), search }).decision

test('cobertura demonstrada exige fonte realmente recuperada', () => {
  const taxi = decide('Solo Galeão, PT-ABC, solicito instruções de táxi')

  assert.equal(taxi.status, COVERAGE.DEMONSTRATED)
  assert.equal(taxi.reason, 'grounded')
  assert.deepEqual(taxi.sourceIds, ['MCA-100-16-artigo-0125-001'])
  assert.equal(taxi.coverage.variant.id, 'taxi_instruction')
  assert.match(taxi.coverage.citation, /Art\. 125/)
  assert.ok(taxi.elements.every(({ sourceId }) => taxi.sourceIds.includes(sourceId) || sourceId === null))
})

test('informação do piloto faltante é perguntada, com variante e citação explícitas', () => {
  const departure = decide('PT-ABC pretende saída VFR')

  assert.equal(departure.status, COVERAGE.NEEDS_CLARIFICATION)
  assert.equal(departure.reason, 'missing-pilot-information')
  assert.equal(departure.coverage.requirement.field, 'destino ou setor')
  assert.deepEqual(departure.sourceIds, [], 'pergunta não é resposta: não cita artigo como cobertura')
  assert.equal(departure.pendingQuestion.sessionField, 'destino')
})

test('dado que a sessão deveria ter é estado ausente, não pergunta ao piloto (§9)', () => {
  const assignment = decide('Solicito a frequência de transferência', { scenarioId: 'ifr_partida_pt', fase: 'rota' })

  assert.equal(assignment.status, COVERAGE.SESSION_CONTEXT_MISSING)
  assert.equal(assignment.reason, 'controller-frequency-not-configured')
  // Não pergunta ao piloto: é o cenário que não tem o dado. Falar de "cobertura documental" aqui
  // afirmaria ausência no manual, que é falso (§9, A3.1).
  assert.doesNotMatch(assignment.spokenText, /cobertura documental|confirme/i)
})

test('fonte externa não integrada é dita como tal, sem acusar o corpus', () => {
  const weather = decide('Solicito meteorologia detalhada')

  assert.equal(weather.status, COVERAGE.EXTERNAL_SOURCE_UNAVAILABLE)
  assert.equal(weather.reason, 'external-source-not-integrated')
  assert.match(weather.spokenText, /fonte externa/)
  assert.doesNotMatch(weather.spokenText, /cobertura documental/i)
  assert.deepEqual(weather.sourceIds, [])
})

test('família ainda não implementada é limitação do simulador, não ausência no manual', () => {
  const goAround = decide('PT-ABC arremetendo, solicitando nova aproximação', { fase: 'aproximacao' })

  assert.equal(goAround.interpretation.intent, 'go_around')
  assert.equal(goAround.status, COVERAGE.COVERAGE_INSUFFICIENT)
  assert.equal(goAround.reason, 'family-not-implemented')
  assert.doesNotMatch(goAround.spokenText, /cobertura documental/i)
})

test('intenção não compreendida é distinta de cobertura insuficiente', () => {
  const unknown = decide('xenobiologia quântica marciana')

  assert.equal(unknown.status, COVERAGE.NOT_UNDERSTOOD)
  assert.equal(unknown.reason, 'intent-not-understood')
  assert.equal(unknown.coverage.rule, null)
})

test('a variante é escolhida pela comunicação, não por um mapa fixo de artigo', () => {
  const fire = decide('Pan pan, PT-ABC, fogo a bordo na cabine', { fase: 'rota' })
  const engine = decide('Mayday, PT-ABC, pane de motor', { fase: 'rota' })

  assert.equal(fire.coverage.variant.id, 'fire_or_smoke')
  assert.deepEqual(fire.sourceIds, ['MCA-100-16-artigo-0066-001', 'MCA-100-16-artigo-0043-001'])
  assert.equal(engine.coverage.variant.id, 'engine')
  assert.deepEqual(engine.sourceIds, ['MCA-100-16-artigo-0064-001'])
  assert.notDeepEqual(fire.sourceIds, engine.sourceIds, 'fogo e motor não compartilham o mesmo artigo')
})

test('o sinal de informação faltante do LLM é consumido, e só sobre requisito documentado (A3.2)', () => {
  // O LLM declara materialmente ausente o destino/setor que a variante documentada exige (art. 122)
  // — mesmo com a frase contendo "setor", a decisão pergunta em vez de presumir.
  const flagged = processTransmission({
    text: 'PT-ABC pretende saída VFR rumo ao setor norte', idioma: 'pt', state: stateFor('vfr_local_pt'), search,
    interpretation: { rawText: 'PT-ABC pretende saída VFR rumo ao setor norte', intent: 'vfr_departure', confidence: 0.9, missingOperationalInformation: ['destinationOrSector'], unknownElements: [] },
  }).decision

  assert.equal(flagged.status, COVERAGE.NEEDS_CLARIFICATION)
  assert.equal(flagged.reason, 'missing-pilot-information')
  assert.equal(flagged.coverage.flagged, true)
  assert.deepEqual(flagged.coverage.flaggedFields, ['destino ou setor'])
  assert.equal(flagged.pendingQuestion.field, 'destino ou setor')

  // Sem o sinal, e com o destino de fato extraído, o mesmo texto é autorizado (art. 122). A
  // interpretação é o que a decisão consome: ela precisa trazer o **valor**, não só a menção (B5).
  const covered = processTransmission({
    text: 'PT-ABC pretende saída VFR rumo ao setor norte', idioma: 'pt', state: stateFor('vfr_local_pt'), search,
    interpretation: { rawText: 'PT-ABC pretende saída VFR rumo ao setor norte', intent: 'vfr_departure', confidence: 0.9, destination: 'norte', missingOperationalInformation: [], unknownElements: [] },
  }).decision
  assert.equal(covered.status, COVERAGE.DEMONSTRATED)
  assert.match(covered.spokenText, /saída VFR para norte/, 'o valor extraído é o que o controlador fala')
  assert.doesNotMatch(covered.spokenText, /undefined/)

  // Campo que nenhuma variante documentada exige não vira pergunta: o LLM não cria requisito.
  const unrelated = processTransmission({
    text: 'Solo Galeão, PT-ABC, solicito instruções de táxi', idioma: 'pt', state: stateFor('vfr_local_pt'), search,
    interpretation: { rawText: 'solicito instruções de táxi', intent: 'taxi_request', confidence: 0.9, missingOperationalInformation: ['vento', 'temperatura'], unknownElements: [] },
  }).decision
  assert.equal(unrelated.status, COVERAGE.DEMONSTRATED)
  assert.deepEqual(unrelated.coverage.flaggedFields ?? [], [])
})

test('requisito com valor estruturado exige o valor: menção do rótulo não autoriza (B5)', () => {
  // A variante do art. 122 exige o destino/setor. Uma interpretação que nomeia o campo mas não o
  // extraiu não pode virar autorização com o dado presumido: antes, isso falava "saída VFR para
  // undefined" — fala sem dado documentado.
  const semValor = processTransmission({
    text: 'PT-ABC, VFR, confirme o destino', idioma: 'pt', state: stateFor('vfr_local_pt'), search,
    interpretation: { rawText: 'PT-ABC, VFR, confirme o destino', intent: 'vfr_departure', confidence: 0.9, missingOperationalInformation: [], unknownElements: [] },
  }).decision

  assert.equal(semValor.status, COVERAGE.NEEDS_CLARIFICATION)
  assert.equal(semValor.pendingQuestion.field, 'destino ou setor')
  assert.match(semValor.spokenText, /confirme o destino ou setor/)
  assert.doesNotMatch(semValor.spokenText, /undefined/)

  // Determinístico: o valor já confirmado na sessão satisfaz o requisito (não se pergunta de novo).
  const confirmado = processTransmission({
    text: 'PT-ABC, saída VFR rumo ao setor norte', idioma: 'pt', state: stateFor('vfr_local_pt'), search,
  }).decision
  assert.equal(confirmado.status, COVERAGE.DEMONSTRATED)
  assert.match(confirmado.spokenText, /saída VFR para norte/)

  // Um artigo não é destino: "para o setor" não tem valor e precisa ser perguntado.
  const artigo = processTransmission({
    text: 'PT-ABC pretende saída VFR para o setor', idioma: 'pt', state: stateFor('vfr_local_pt'), search,
  }).decision
  assert.equal(artigo.status, COVERAGE.NEEDS_CLARIFICATION)
  assert.doesNotMatch(artigo.spokenText, /undefined|para o\b/)

  // O local do fogo (art. 43, Tabela 15) tem o vocabulário **falado** como valor: a menção basta.
  const fogo = processTransmission({
    text: 'Estamos com fogo aqui.', idioma: 'pt', state: stateFor('vfr_local_pt', 'rota'), search,
  }).decision
  assert.equal(fogo.status, COVERAGE.NEEDS_CLARIFICATION, 'sem parte da aeronave, pergunta')
  const localizado = processTransmission({
    text: 'Fogo no motor direito.', idioma: 'pt', state: stateFor('vfr_local_pt', 'rota'), search,
  }).decision
  assert.equal(localizado.status, COVERAGE.DEMONSTRATED, 'o vocabulário falado é o valor')
  assert.deepEqual(localizado.sourceIds, ['MCA-100-16-artigo-0066-001', 'MCA-100-16-artigo-0043-001'])
})

test('intenções que antes caíam em "sem cobertura" alcançam o artigo que as documenta', () => {
  const cases = [
    ['Solo Galeão, PT-ABC, reportando posição dez milhas ao sul', 'position_report'],
    ['PT-ABC impossibilitado de cumprir a instrução', 'unable'],
  ]

  for (const [text, intent] of cases) {
    const decision = decide(text, { fase: 'rota' })
    assert.equal(decision.interpretation.intent, intent, text)
    assert.equal(decision.status, COVERAGE.DEMONSTRATED, text)
    assert.ok(decision.sourceIds.length > 0, text)
    assert.ok(decision.sourceIds.every((id) => decision.coverage.sources.includes(id)), text)
  }
})
