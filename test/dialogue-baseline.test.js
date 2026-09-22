/**
 * F0 — Detector de mudanca (NAO-NORMATIVO).
 *
 * Este teste roda os roteiros de `reference/dialogue-inventory.v1.json` sobre o pipeline
 * real que o navegador executa e compara o resultado com o snapshot versionado em
 * `reference/dialogue-baseline.v1.json`.
 *
 * Ele NAO afirma que o comportamento registrado esta CORRETO. A verdade operacional vem do
 * corpus (`atc-simulator-chunks.json`); a matriz normativa de dialogo e o entregavel do F3
 * (`reference/dialogue-regression-matrix.json`). Portanto:
 *
 * - falha aqui significa "o comportamento mudou", nao "o comportamento esta errado";
 * - cada diferenca deve ser classificada como PRETENDIDA (e encaminhada ao F3 como caso
 *   explicito) ou REGRESSAO (e corrigida);
 * - regenerar o snapshot exige acao deliberada: `node scripts/update-dialogue-baseline.mjs`.
 *
 * Nao adicione este arquivo ao `npm run audit`: durante F1/F2 ele deve falhar a cada
 * mudanca pretendida, e o gate de auditoria passa a incluir a matriz normativa no F3.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SCENARIOS } from '../src/scenarios.js'
import { diffBaseline, loadInventory, runInventory } from '../scripts/update-dialogue-baseline.mjs'

const BASELINE_URL = new URL('../reference/dialogue-baseline.v1.json', import.meta.url)
const baseline = JSON.parse(await readFile(BASELINE_URL, 'utf8'))

test('inventario de caracterizacao e bem formado e cobre todos os cenarios versionados', async () => {
  const inventory = await loadInventory()
  const cenarios = new Set(inventory.roteiros.map((roteiro) => roteiro.cenario))
  for (const cenario of cenarios) assert.ok(cenario in SCENARIOS, `cenario desconhecido: ${cenario}`)
  for (const nome of Object.keys(SCENARIOS)) assert.ok(cenarios.has(nome), `cenario sem roteiro no inventario: ${nome}`)
  for (const roteiro of inventory.roteiros) {
    assert.ok(roteiro.turnos.length >= 2, `roteiro ${roteiro.id} precisa de mais de um turno`)
    for (const [index, turno] of roteiro.turnos.entries()) {
      assert.ok(typeof turno.piloto === 'string' && turno.piloto.trim(), `turno ${index + 1} de ${roteiro.id} sem fala do piloto`)
    }
  }
})

test('baseline cobre exatamente os roteiros do inventario', async () => {
  const inventory = await loadInventory()
  assert.deepEqual(
    baseline.roteiros.map((roteiro) => roteiro.id).sort(),
    inventory.roteiros.map((roteiro) => roteiro.id).sort(),
  )
  assert.ok(baseline.aviso?.includes('NAO-NORMATIVO'), 'baseline sem aviso de nao-normatividade')
})

test('caracterizacao: o pipeline real ainda se comporta como o snapshot versionado', async () => {
  const atual = await runInventory()
  const differences = diffBaseline(baseline, atual)
  assert.equal(
    differences.length,
    0,
    `A caracterizacao do F0 mudou em ${differences.length} ponto(s). Classifique cada diferenca como PRETENDIDA (encaminhe ao F3) ou REGRESSAO (corrija); so depois, se for o caso, rode \`node scripts/update-dialogue-baseline.mjs\`.\n${differences.slice(0, 25).map((difference) => `  - ${difference}`).join('\n')}`,
  )
})

test('caracterizacao e deterministica entre execucoes', async () => {
  const first = await runInventory()
  const second = await runInventory()
  assert.deepEqual(diffBaseline(first, second), [])
})
