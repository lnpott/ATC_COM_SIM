import assert from 'node:assert/strict'
import test from 'node:test'
import { processTransmission } from '../src/pipeline.js'
import { ManualSearch } from '../src/search.js'
import { getScenario } from '../src/scenarios.js'
import { applyStateUpdate, createSimulationState } from '../src/state-machine.js'

const search = await ManualSearch.load()

function state(idioma = 'pt', fase = 'solo') {
  const scenario = getScenario(idioma === 'en' ? 'vfr_local_en' : 'vfr_local_pt')
  scenario.fase = fase
  return createSimulationState(scenario)
}

const unseen = [
  ['pt', 'solo', 'Galeão Solo, PT-XYZ, box sete, com informação Delta, desejo movimentar para o ponto de espera', 'taxi_request', 'MCA-100-16-artigo-0125-001'],
  ['pt', 'solo', 'Solo, PT-ABC, no estacionamento três, VFR local pela área leste, estamos prontos para taxiar', 'taxi_request', 'MCA-100-16-artigo-0125-001'],
  ['en', 'solo', 'Ground, PT-ABC at gate four with Alpha, VFR west sector, taxi requested when able', 'taxi_request', 'MCA-100-16-artigo-0125-001'],
  ['en', 'solo', 'PT-ABC has copied the traffic, ready for departure when convenient', 'takeoff_request', 'MCA-100-16-artigo-0126-001'],
  ['pt', 'rota', 'PT-ABC dez milhas a nordeste, deseja entrar no circuito', 'traffic_circuit', 'MCA-100-16-artigo-0129-001'],
  ['en', 'rota', 'PT-ABC inbound from the east, join the traffic pattern requested', 'traffic_circuit', 'MCA-100-16-artigo-0129-001'],
  ['pt', 'rota', 'Controle, PT-ABC requer procedimento RNAV de aproximação', 'approach_request', 'MCA-100-16-artigo-0114-001'],
  ['en', 'aproximacao', 'PT-ABC established final, landing clearance requested', 'landing_request', 'MCA-100-16-artigo-0132-001'],
  ['pt', 'rota', 'Pan pan, PT-ABC, emergência por fogo no motor', 'emergency', 'MCA-100-16-artigo-0064-001'],
  ['en', 'rota', 'Control PT-ABC requesting a change to frequency 124.70', 'frequency_change', 'MCA-100-16-artigo-0059-001'],
  ['pt', 'solo', 'PT-ABC pretende saída VFR pelo setor oeste', 'vfr_departure', 'MCA-100-16-artigo-0122-001'],
  ['en', 'solo', 'PT-ABC outbound VFR to the east sector', 'vfr_departure', 'MCA-100-16-artigo-0122-001'],
]

test(`avalia ${unseen.length} formulações inéditas sem overfitting`, () => {
  for (const [idioma, fase, text, intent, source] of unseen) {
    const result = processTransmission({ text, idioma, state: state(idioma, fase), search })
    assert.equal(result.interpretation.intent, intent, text)
    assert.equal(result.decision.status, 'documented', text)
    assert.deepEqual(result.decision.sourceIds, [source], text)
  }
})

test('ambiguidade pede intenção e readback usa autorização da mesma sessão', () => {
  const ambiguous = processTransmission({ text: 'solicito táxi e pouso', idioma: 'pt', state: state(), search })
  assert.equal(ambiguous.decision.status, 'not_understood')

  const initial = state()
  const clearance = processTransmission({ text: 'solicito táxi', idioma: 'pt', state: initial, search })
  const withClearance = applyStateUpdate(initial, clearance.decision.stateUpdate)
  const readback = processTransmission({ text: 'ciente pista 18 QNH 1015', idioma: 'pt', state: withClearance, search })
  assert.equal(readback.decision.status, 'documented')
  assert.deepEqual(readback.decision.sourceIds, ['MCA-100-16-artigo-0012-001'])
})
