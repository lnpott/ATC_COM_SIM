import assert from 'node:assert/strict'
import test from 'node:test'
import { createGroundedControllerReply, detectIntent, searchPhaseForIntent } from '../src/controller.js'
import { processTransmission } from '../src/pipeline.js'
import { ManualSearch } from '../src/search.js'
import { getScenario } from '../src/scenarios.js'
import { applyStateUpdate, createSimulationState } from '../src/state-machine.js'
import { interpretTransmission } from '../src/transmission.js'

const search = await ManualSearch.load()

function stateFor(phase = 'solo', idioma = 'pt') {
  const scenario = getScenario(idioma === 'en' ? 'vfr_local_en' : 'vfr_local_pt')
  scenario.fase = phase
  scenario.frequencia = phase
  return createSimulationState(scenario)
}

const interpretationCases = [
  ['pt', 'solo', 'solicito táxi', 'taxi_request'],
  ['pt', 'solo', 'pronto para movimentação no pátio', 'taxi_request'],
  ['pt', 'solo', 'gostaria de iniciar o táxi', 'taxi_request'],
  ['en', 'solo', 'request taxi instructions', 'taxi_request'],
  ['en', 'solo', 'ready for push and taxi', 'taxi_request'],
  ['pt', 'solo', 'pronto para partida', 'takeoff_request'],
  ['pt', 'solo', 'torre solicito decolagem', 'takeoff_request'],
  ['en', 'solo', 'ready for departure', 'takeoff_request'],
  ['en', 'solo', 'request takeoff runway one eight', 'takeoff_request'],
  ['pt', 'rota', 'solicito ingresso no circuito', 'traffic_circuit'],
  ['pt', 'rota', 'perna do vento para ingresso', 'traffic_circuit'],
  ['en', 'rota', 'request to join traffic pattern', 'traffic_circuit'],
  ['pt', 'rota', 'solicito aproximação ILS', 'approach_request'],
  ['en', 'rota', 'request RNAV approach', 'approach_request'],
  ['pt', 'aproximacao', 'na final solicito pouso', 'landing_request'],
  ['en', 'aproximacao', 'request landing runway one eight', 'landing_request'],
  ['pt', 'rota', 'mayday falha de motor', 'emergency'],
  ['en', 'rota', 'engine failure declaring emergency', 'emergency'],
  ['pt', 'rota', 'solicito troca para frequência 123,45', 'frequency_change'],
  ['en', 'rota', 'request frequency change 123.45', 'frequency_change'],
  ['pt', 'solo', 'VFR saída para o setor norte', 'vfr_departure'],
  ['en', 'solo', 'request VFR departure southbound', 'vfr_departure'],
  ['pt', 'solo', 'ciente pista 18 QNH 1015', 'readback'],
  ['en', 'solo', 'roger runway 18 altimeter 1015', 'readback'],
  ['pt', 'solo', 'solicito meteorologia detalhada', 'weather_request'],
  ['en', 'solo', 'request detailed weather report', 'weather_request'],
  ['pt', 'solo', 'xenobiologia quântica marciana', 'unknown'],
]

test(`interpreta semanticamente ${interpretationCases.length} formulações PT/EN`, () => {
  for (const [idioma, phase, text, expected] of interpretationCases) {
    const result = interpretTransmission(text, { idioma, state: stateFor(phase, idioma) })
    assert.equal(result.intent, expected, text)
  }
})

test('regressão: transmissão longa preserva intenção e extrai entidades independentes', () => {
  const text = 'Bom dia, Solo Galeão, Papa Tango Alfa Bravo, posição dois, informação Bravo, VFR para o setor norte, solicito instruções de táxi.'
  const result = interpretTransmission(text, { idioma: 'pt', state: stateFor() })
  assert.equal(result.intent, 'taxi_request')
  assert.equal(result.stationCalled, 'solo galeao')
  assert.equal(result.callSign, 'PTAB')
  assert.equal(result.position, 'dois')
  assert.equal(result.atis, 'BRAVO')
  assert.equal(result.flightRules, 'VFR')
  assert.equal(result.destination, 'norte')
  assert.ok(result.confidence >= 0.9)
})

const groundedCases = [
  ['pt', 'solo', 'Solo Galeão PT-ABC solicito instruções de táxi', 'taxi_request', 'MCA-100-16-artigo-0125-001'],
  ['pt', 'solo', 'Bom dia Solo Galeão Papa Tango Alfa Bravo posição dois informação Bravo VFR para o setor norte solicito instruções de táxi', 'taxi_request', 'MCA-100-16-artigo-0125-001'],
  ['pt', 'solo', 'PT-ABC no pátio com Bravo, pronto para movimentação, observação sem relevância operacional', 'taxi_request', 'MCA-100-16-artigo-0125-001'],
  ['en', 'solo', 'Good morning Galeão Ground PT-ABC stand two information Bravo VFR northbound ready to taxi', 'taxi_request', 'MCA-100-16-artigo-0125-001'],
  ['pt', 'solo', 'Torre PT-ABC pronto para partida', 'takeoff_request', 'MCA-100-16-artigo-0126-001'],
  ['en', 'solo', 'Tower PT-ABC ready for takeoff', 'takeoff_request', 'MCA-100-16-artigo-0126-001'],
  ['pt', 'rota', 'Torre PT-ABC cinco milhas sul solicito ingresso no circuito', 'traffic_circuit', 'MCA-100-16-artigo-0129-001'],
  ['en', 'rota', 'Tower PT-ABC five miles south request to join traffic pattern', 'traffic_circuit', 'MCA-100-16-artigo-0129-001'],
  ['pt', 'rota', 'Controle PT-ABC solicito aproximação ILS', 'approach_request', 'MCA-100-16-artigo-0114-001'],
  ['en', 'rota', 'Approach PT-ABC request ILS approach', 'approach_request', 'MCA-100-16-artigo-0114-001'],
  ['pt', 'aproximacao', 'Torre PT-ABC final solicito pouso', 'landing_request', 'MCA-100-16-artigo-0132-001'],
  ['en', 'aproximacao', 'Tower PT-ABC final request landing', 'landing_request', 'MCA-100-16-artigo-0132-001'],
  ['pt', 'rota', 'Mayday PT-ABC falha de motor', 'emergency', 'MCA-100-16-artigo-0064-001'],
  ['en', 'rota', 'Mayday PT-ABC engine failure', 'emergency', 'MCA-100-16-artigo-0064-001'],
  ['pt', 'rota', 'PT-ABC solicito troca frequência 123,45', 'frequency_change', 'MCA-100-16-artigo-0059-001'],
  ['en', 'rota', 'PT-ABC request frequency change 123.45', 'frequency_change', 'MCA-100-16-artigo-0059-001'],
  ['pt', 'solo', 'PT-ABC VFR saída setor norte', 'vfr_departure', 'MCA-100-16-artigo-0122-001'],
  ['en', 'solo', 'PT-ABC request VFR departure to south sector', 'vfr_departure', 'MCA-100-16-artigo-0122-001'],
]

test(`pipeline recupera e cita a fonte pertinente em ${groundedCases.length} casos`, () => {
  for (const [idioma, phase, text, intent, source] of groundedCases) {
    const result = processTransmission({ text, idioma, state: stateFor(phase, idioma), search, debug: true })
    assert.equal(result.interpretation.intent, intent, text)
    assert.equal(result.decision.status, 'documented', text)
    assert.ok(result.retrieval.expanded.some(({ id }) => id === source), text)
    assert.deepEqual(result.decision.sourceIds, [source], text)
    assert.ok(result.decision.sourceIds.every((id) => result.retrieval.expanded.some((item) => item.id === id)), text)
  }
})

test('diferencia intenção desconhecida, informação faltante e ausência real de cobertura', () => {
  const unknown = processTransmission({ text: 'xenobiologia quântica marciana', idioma: 'pt', state: stateFor(), search })
  assert.equal(unknown.decision.status, 'not_understood')
  assert.doesNotMatch(unknown.decision.spokenText, /cobertura documental/i)

  const permission = processTransmission({ text: 'solicito mudança de frequência', idioma: 'pt', state: stateFor('rota'), search })
  assert.equal(permission.decision.status, 'documented')
  assert.match(permission.decision.spokenText, /mudança de frequência aprovada/)
  assert.deepEqual(permission.decision.sourceIds, ['MCA-100-16-artigo-0059-001'])

  const assignment = processTransmission({ text: 'solicito a frequência', idioma: 'pt', state: stateFor('rota'), search })
  assert.equal(assignment.decision.status, 'operational_context_missing')
  assert.equal(assignment.decision.reason, 'controller-frequency-not-configured')
  assert.doesNotMatch(assignment.decision.spokenText, /confirme/i)

  const unsupported = processTransmission({ text: 'solicito meteorologia detalhada', idioma: 'pt', state: stateFor(), search })
  assert.equal(unsupported.decision.status, 'unsupported')
  assert.match(unsupported.decision.spokenText, /cobertura documental/)
})

test('estado conserva contexto validado e não o compartilha entre sessões', () => {
  const first = stateFor()
  const text = 'Solo Galeão PT-ABC posição dois informação Bravo VFR setor norte solicito táxi'
  const result = processTransmission({ text, idioma: 'pt', state: first, search })
  const updated = applyStateUpdate(first, result.decision.stateUpdate)
  assert.deepEqual({ posicao: updated.aeronave.posicao, atis: updated.contexto.atis, regras: updated.contexto.regras_voo, destino: updated.contexto.destino }, { posicao: 'dois', atis: 'BRAVO', regras: 'VFR', destino: 'norte' })
  assert.deepEqual(stateFor().contexto, {})
})

test('diagnóstico estruturado identifica cada estágio sem incluir segredos', () => {
  const result = processTransmission({ text: 'PT-ABC pronto para táxi', idioma: 'pt', state: stateFor(), search, debug: true })
  for (const field of ['rawTranscript', 'finalTranscript', 'interpretationMode', 'intent', 'confidence', 'queriesGenerated', 'bm25Results', 'reranked', 'expandedContext', 'evidenceUsed', 'decision', 'reason', 'stateUpdate', 'responseMode']) assert.ok(field in result.diagnostics, field)
  assert.equal(result.diagnostics.interpretationMode, 'deterministic_fallback')
  assert.equal(result.diagnostics.intent, 'taxi_request')
  assert.ok(result.diagnostics.reranked[0].retrievalReasons.includes('intent-metadata'))
  assert.deepEqual(result.diagnostics.evidenceUsed, ['MCA-100-16-artigo-0125-001'])
})

test('retrieval híbrido melhora recall sobre o baseline lexical/rígido', () => {
  const legacySources = { taxi: 'MCA-100-16-artigo-0125-001', decolagem: 'MCA-100-16-artigo-0126-001', aproximacao: 'MCA-100-16-artigo-0114-001', pouso: 'MCA-100-16-artigo-0132-001', emergencia: 'MCA-100-16-artigo-0064-001' }
  let legacy = 0
  let hybrid = 0
  for (const [idioma, phase, text, intent, source] of groundedCases) {
    const state = stateFor(phase, idioma)
    const oldIntent = detectIntent(text)
    const oldResults = search.search({ texto: text, idioma, fase_de_voo: searchPhaseForIntent(oldIntent, phase), limite: 8 })
    if (oldIntent && oldResults.some(({ id }) => id === legacySources[oldIntent.name])) legacy += 1
    const current = processTransmission({ text, idioma, state, search })
    if (current.interpretation.intent === intent && current.decision.sourceIds.includes(source)) hybrid += 1
  }
  assert.ok(hybrid > legacy, `baseline=${legacy}, híbrido=${hybrid}`)
  assert.equal(hybrid, groundedCases.length)
  assert.equal(legacy, 9)
})

test('mudança de frequência é autorização do controlador, não dado obrigatório do piloto', () => {
  for (const [idioma, text, approval] of [
    ['pt', 'Solo Galeão, Papa Tango Alfa Bravo, solicito mudança de frequência.', /mudança de frequência aprovada/i],
    ['pt', 'Papa Tango Alfa Bravo pede troca de frequência', /mudança de frequência aprovada/i],
    ['en', 'Galeao Ground, Papa Tango Alpha Bravo, request frequency change', /frequency change approved/i]
  ]) {
    const result = processTransmission({ text, idioma, state: stateFor('rota', idioma), search })
    assert.equal(result.interpretation.intent, 'frequency_change')
    assert.equal(result.decision.status, 'documented')
    assert.match(result.decision.spokenText, approval)
    assert.deepEqual(result.decision.sourceIds, ['MCA-100-16-artigo-0059-001'])
    assert.equal(result.decision.stateUpdate.frequencia, undefined)
  }

  for (const [idioma, text] of [['pt', 'solicito a frequência'], ['en', 'request the transfer frequency']]) {
    const result = processTransmission({ text, idioma, state: stateFor('rota', idioma), search })
    assert.equal(result.decision.status, 'operational_context_missing')
    assert.equal(result.decision.reason, 'controller-frequency-not-configured')
    assert.doesNotMatch(result.decision.spokenText, /confirme|confirm/i)
    assert.equal(result.decision.stateUpdate, null)
  }
})
