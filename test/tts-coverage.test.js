/**
 * Fonia também em esclarecimento e recusa (F7 — A3.9).
 *
 * O navegador fala toda fala do controlador. Como a decisão vive fora do DOM, o contrato que a
 * fonia depende é verificável aqui: os quatro status sem cobertura documental precisam produzir
 * `spokenText` não vazio. Sem isso, a política de fonia não teria o que falar.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { processTransmission } from '../src/pipeline.js'
import { getScenario } from '../src/scenarios.js'
import { ManualSearch } from '../src/search.js'
import { createSimulationState } from '../src/state-machine.js'
import { NEVER_SPOKEN_STATUSES, shouldSpeak, silenceReason, speaksWithoutCoverage } from '../src/tts-policy.js'

const search = await ManualSearch.load()

function stateFor(scenarioId = 'vfr_local_pt', fase) {
  const scenario = getScenario(scenarioId)
  if (fase) scenario.fase = fase
  return createSimulationState(scenario)
}

const decide = (text, { idioma = 'pt', scenarioId = 'vfr_local_pt', fase } = {}) =>
  processTransmission({ text, idioma, state: stateFor(scenarioId, fase), search }).decision

test('nenhum status suprime fala do controlador', () => {
  assert.deepEqual([...NEVER_SPOKEN_STATUSES], [])
  for (const status of ['documented', 'needs_clarification', 'not_understood', 'session_context_missing', 'external_source_unavailable', 'coverage_insufficient']) {
    assert.equal(shouldSpeak({ status, spokenText: 'PT-ABC, ciente.' }), true, status)
  }
  assert.equal(shouldSpeak({ status: 'documented', spokenText: '   ' }), false, 'texto vazio não é fala')
  assert.equal(silenceReason({ status: 'documented', spokenText: '' }), 'no-controller-speech')
})

test('esclarecimento é falado e o enunciado cobre o ramo sem cobertura', () => {
  const clarification = decide('PT-ABC pretende saída VFR')
  assert.equal(clarification.covered, false)
  assert.equal(clarification.status, 'needs_clarification')
  assert.ok(clarification.spokenText.trim().length > 0)
  assert.equal(shouldSpeak(clarification), true)
  assert.equal(speaksWithoutCoverage(clarification), true, 'a resposta sem cobertura precisa ser falada')
})

test('os quatro status não-documentados sempre produzem fala', () => {
  const cases = [
    ['xenobiologia quântica marciana', 'not_understood'],
    ['PT-ABC pretende saída VFR', 'needs_clarification'],
    ['Solicito a frequência de transferência', 'session_context_missing'],
    ['Solicito meteorologia detalhada', 'external_source_unavailable'],
  ]
  for (const [text, expected] of cases) {
    const decision = decide(text, { scenarioId: expected === 'session_context_missing' ? 'ifr_partida_pt' : 'vfr_local_pt', fase: expected === 'session_context_missing' ? 'rota' : undefined })
    assert.equal(decision.status, expected, text)
    assert.equal(decision.covered, false, text)
    assert.ok(decision.spokenText?.trim().length > 0, `sem fala para ${expected}`)
    assert.equal(shouldSpeak(decision), true, expected)
  }
})

test('recusa por base insuficiente também fala, e nenhuma fala é inventada sem decisão', () => {
  const familyMissing = decide('PT-ABC arremetendo, solicitando nova aproximação', { fase: 'aproximacao' })
  assert.equal(familyMissing.status, 'coverage_insufficient')
  assert.ok(familyMissing.spokenText.trim().length > 0)
  assert.equal(shouldSpeak(familyMissing), true)
  assert.equal(speaksWithoutCoverage(familyMissing), true)
  assert.equal(shouldSpeak(null), false)
})
