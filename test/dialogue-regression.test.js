/**
 * Matriz normativa de regressão de diálogo (F3).
 *
 * Diferente de `contextual-pipeline.test.js` e `heldout-evaluation.test.js`, que avaliam
 * transmissões isoladas com o estado recriado a cada caso, aqui a sequência importa: os turnos de
 * um roteiro rodam sobre o **mesmo** objeto de estado (normalização → processTransmission →
 * applyStateUpdate → recordTransmission), como `web/app.js` faz. É isso que pega uma regressão em
 * que a fase muda errado no meio de um voo mas cada turno isolado continua "correto".
 *
 * A validação documental da matriz (fonte pertencer à regra da intenção, campo obrigatório do
 * art. 12, III) roda em `scripts/validate-dialogue-matrix.mjs`, incluído em `npm run audit`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadMatrix, validateMatrix } from '../scripts/validate-dialogue-matrix.mjs'
import { normalizePhraseology } from '../src/normalization.js'
import { processTransmission } from '../src/pipeline.js'
import { getScenario } from '../src/scenarios.js'
import { ManualSearch } from '../src/search.js'
import { applyStateUpdate, createSimulationState, recordTransmission } from '../src/state-machine.js'

const search = await ManualSearch.load()
const matrix = await loadMatrix()

/** Executa um turno como o navegador: estado evolui, decisão é auditada. */
function runTurn(state, piloto, idioma) {
  const normalized = normalizePhraseology(piloto)
  const before = state
  const withPilot = recordTransmission(before, { origem: 'piloto', texto: normalized })
  const result = processTransmission({ text: piloto, idioma, state: withPilot, search })
  const decision = result.decision
  let after = withPilot
  if (decision.stateUpdate) after = applyStateUpdate(withPilot, decision.stateUpdate)
  after = recordTransmission(after, { origem: 'atco', texto: decision.spokenText, fontes: decision.sourceIds })
  return { ...result, state: after, decision }
}

test('a matriz normativa é coerente antes de executar (schema, corpus e Art. 12, III)', async () => {
  const { problems } = await validateMatrix({ search })
  assert.deepEqual(problems, [], `matriz inválida:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
})

for (const roteiro of matrix.roteiros) {
  test(`regressão de sequência: ${roteiro.id}`, () => {
    const scenario = getScenario(roteiro.cenario)
    let state = createSimulationState(scenario)

    assert.equal(state.fase, 'solo', 'todo roteiro começa na fase solo do cenário')

    for (const [index, turn] of roteiro.turnos.entries()) {
      const label = `${roteiro.id} turno ${index + 1} ("${turn.piloto}")`
      const { decision, state: next } = runTurn(state, turn.piloto, scenario.idioma)
      const espera = turn.espera

      assert.equal(decision.interpretation?.intent, espera.intent, `${label}: intenção`)
      assert.equal(decision.status, espera.status, `${label}: status (motivo: ${decision.reason})`)

      // Toda fonte citada tem de ter sido realmente recuperada (regra de ouro do projeto).
      const cited = decision.sourceIds ?? []
      assert.deepEqual(cited, espera.fontes, `${label}: fontes citadas`)
      for (const fonte of cited) {
        assert.ok((decision.coverage?.sources ?? []).includes(fonte), `${label}: fonte ${fonte} não foi recuperada`)
      }

      if (espera.perguntaPendente) {
        assert.equal(decision.pendingQuestion?.field, espera.perguntaPendente, `${label}: pergunta pendente`)
      }

      if (espera.cotejamento) {
        const assessment = decision.readbackAssessment
        assert.ok(assessment, `${label}: turno de cotejamento sem avaliação`)
        assert.equal(assessment.classification, espera.cotejamento.classificacao, `${label}: classificação do cotejamento`)
        assert.deepEqual([...assessment.obrigatorios], espera.cotejamento.obrigatorios, `${label}: campos obrigatórios`)
        assert.deepEqual([...assessment.informativos], espera.cotejamento.informativos, `${label}: campos informativos`)
        // A obrigação só é encerrada quando o cotejamento está correto (art. 12, III).
        if (espera.cotejamento.classificacao === 'correct') {
          assert.equal(next.contexto.cotejamento_pendente, false, `${label}: obrigação deveria estar encerrada`)
        } else {
          assert.equal(next.contexto.cotejamento_pendente, true, `${label}: obrigação deveria continuar pendente`)
        }
      }

      assert.equal(next.fase, espera.fase, `${label}: fase após o turno`)
      assert.equal(next.frequencia, espera.frequencia, `${label}: frequência após o turno`)
      assert.ok(next.historico.length >= index + 1, `${label}: histórico da sessão`)
      state = next
    }
  })
}
