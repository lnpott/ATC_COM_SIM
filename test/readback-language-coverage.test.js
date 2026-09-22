/**
 * Cobertura documental do cotejamento fora da língua original do manual (lacuna A3.14).
 *
 * Base documental no corpus (374 chunks), verificada diretamente em
 * `atc-simulator-chunks.json`:
 *
 * - obrigação de cotejar e o que deve ser cotejado: MCA 100-16 art. 12 III (e art. 45),
 *   `idioma: pt` — os artigos normativos do manual (arts. 1 a 55) não têm coluna em inglês,
 *   que existe apenas nas tabelas de fraseologia;
 * - conceito e termo nos dois idiomas: MCA 100-16 art. 39 (glossário, `pt-en`,
 *   "COTEJE / READ BACK");
 * - fraseologia do cotejamento correto nos dois idiomas: MCA 100-16 art. 138 (`pt-en`,
 *   "cotejamento correto / your read back is correct").
 *
 * Das nove fontes normativas mapeadas por intenção, **oito são `pt-en`**; a única acessível
 * apenas em português é justamente o art. 12 (cotejamento). Por isso uma sessão em inglês
 * declarava "ausência de cobertura documental" para um ato documentado — o falso negativo
 * que o PLANO_REF §10 proíbe. A correção recupera a fonte na língua original via BM25, sem
 * injetar artigo por ID e sem criar texto normativo novo.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { processTransmission } from '../src/pipeline.js'
import { ManualSearch } from '../src/search.js'
import { getScenario } from '../src/scenarios.js'
import { applyStateUpdate, createSimulationState } from '../src/state-machine.js'

const search = await ManualSearch.load()
const READBACK_SOURCE = 'MCA-100-16-artigo-0012-001'
const TAXI_SOURCE = 'MCA-100-16-artigo-0125-001'

function stateFor(scenario) {
  return createSimulationState(getScenario(scenario))
}

/** Emite uma autorização real na sessão e devolve o estado já atualizado. */
function withClearance({ idioma, scenario, request }) {
  const state = stateFor(scenario)
  const clearance = processTransmission({ text: request, idioma, state, search })
  assert.equal(clearance.decision.status, 'documented', `preparação falhou para: ${request}`)
  return { state: applyStateUpdate(state, clearance.decision.stateUpdate), clearance }
}

test('sessão em inglês cita a provisão de cotejamento na língua original, sem declarar ausência de cobertura', () => {
  const { state } = withClearance({ idioma: 'en', scenario: 'vfr_local_en', request: 'Galeao Ground, PT-ABC, request taxi instructions' })
  const readback = processTransmission({ text: 'Roger runway one eight, altimeter 1015', idioma: 'en', state, search })

  assert.equal(readback.interpretation.intent, 'readback')
  assert.equal(readback.decision.status, 'documented')
  assert.deepEqual(readback.decision.sourceIds, [READBACK_SOURCE])
  assert.equal(readback.retrieval.diagnostics.originalLanguageFallback, true)
  assert.deepEqual(readback.retrieval.diagnostics.fallbackSourceIds, [READBACK_SOURCE])

  const evidence = readback.retrieval.expanded.find(({ id }) => id === READBACK_SOURCE)
  assert.ok(evidence, 'a fonte normativa precisa estar no contexto recuperado')
  assert.equal(evidence.idioma, 'pt')
  assert.ok(evidence.score > 0, 'a evidência entra por recuperação real, não por injeção')
  assert.ok(evidence.retrievalReasons.includes('original-language-fallback'))
})

test('a evidência fora da língua da sessão não desloca o ranking da língua da sessão', () => {
  const { state } = withClearance({ idioma: 'en', scenario: 'vfr_local_en', request: 'Galeao Ground, PT-ABC, request taxi instructions' })
  const readback = processTransmission({ text: 'Roger runway one eight, altimeter 1015', idioma: 'en', state, search })

  // 8 resultados da janela + 1 evidência normativa acrescentada fora do ranking.
  assert.equal(readback.retrieval.results.length, 9)
  assert.equal(readback.retrieval.results.at(-1).id, READBACK_SOURCE)
  assert.deepEqual(readback.retrieval.diagnostics.afterRerank.at(-1).retrievalReasons, ['original-language-fallback'])
})

test('sessão em português não aciona a passagem pela língua original', () => {
  const { state } = withClearance({ idioma: 'pt', scenario: 'vfr_local_pt', request: 'Solo Galeão, PT-ABC, solicito instruções de táxi' })
  const readback = processTransmission({ text: 'Ciente pista 18, QNH 1015', idioma: 'pt', state, search })

  assert.equal(readback.decision.status, 'documented')
  assert.deepEqual(readback.decision.sourceIds, [READBACK_SOURCE])
  assert.equal(readback.retrieval.diagnostics.originalLanguageFallback, false)
  assert.deepEqual(readback.retrieval.diagnostics.fallbackSourceIds, [])
  assert.equal(readback.retrieval.results.length, 8)
})

test('fonte bilíngue não depende da passagem pela língua original', () => {
  const { clearance } = withClearance({ idioma: 'en', scenario: 'vfr_local_en', request: 'Galeao Ground, PT-ABC, request taxi instructions' })

  assert.deepEqual(clearance.decision.sourceIds, [TAXI_SOURCE])
  assert.equal(clearance.retrieval.diagnostics.originalLanguageFallback, false)
  assert.ok(clearance.retrieval.expanded.some(({ id }) => id === TAXI_SOURCE))
})

test('a passagem pela língua original não fabrica cobertura inexistente', () => {
  const unsupported = processTransmission({ text: 'request detailed weather report', idioma: 'en', state: stateFor('vfr_local_en'), search })

  assert.equal(unsupported.interpretation.intent, 'weather_request')
  assert.equal(unsupported.decision.status, 'external_source_unavailable')
  assert.deepEqual(unsupported.decision.sourceIds, [])
  assert.equal(unsupported.retrieval.diagnostics.originalLanguageFallback, false)
  assert.deepEqual(unsupported.retrieval.diagnostics.fallbackSourceIds, [])
})

test('sessão em inglês completa o ciclo de cotejamento da decolagem', () => {
  const { state: afterTaxi } = withClearance({ idioma: 'en', scenario: 'vfr_local_en', request: 'Galeao Ground, PT-ABC, request taxi instructions' })
  const takeoff = processTransmission({ text: 'Tower, PT-ABC ready for departure', idioma: 'en', state: afterTaxi, search })
  const state = applyStateUpdate(afterTaxi, takeoff.decision.stateUpdate)
  const readback = processTransmission({ text: 'Roger runway one eight, cleared for take-off', idioma: 'en', state, search })

  assert.equal(takeoff.decision.status, 'documented')
  assert.equal(readback.decision.status, 'documented')
  assert.deepEqual(readback.decision.sourceIds, [READBACK_SOURCE])
  assert.equal(readback.retrieval.diagnostics.originalLanguageFallback, true)
})
