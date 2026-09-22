import { readFile } from 'node:fs/promises'
import { diffBaseline, runInventory } from './update-dialogue-baseline.mjs'

const baseline = JSON.parse(await readFile(new URL('../reference/dialogue-baseline.v1.json', import.meta.url), 'utf8'))
const actual = await runInventory()
const differences = diffBaseline(baseline, actual)
console.log(`total: ${differences.length} diferenca(s)`)

const changed = new Set(differences.map((line) => line.match(/^(roteiros\.\d+\.turnos\.\d+)\..*/)?.[1]).filter(Boolean))
for (const key of [...changed]) {
  const [roteiroIndex, turnoIndex] = key.replace('roteiros.', '').split('.turnos.')
  const before = baseline.roteiros[roteiroIndex].turnos[turnoIndex]
  const after = actual.roteiros[roteiroIndex].turnos[turnoIndex]
  if (!before || !after) continue
  const sig = (t) => `${t.status}/${t.reason} intent=${t.intent} coberto=${t.covered} estado=${t.estadoAplicado} fontes=[${(t.sourceIds ?? []).join(' ')}]`
  const same = (field) => (before[field] === after[field] ? '   ' : '  *')
  if (sig(before) === sig(after) && before.spokenText === after.spokenText) continue
  console.log(`\n[${baseline.roteiros[roteiroIndex].id}] turno ${turnoIndex}: ${before.piloto}`)
  console.log(`   antes : ${sig(before)}`)
  console.log(`   agora : ${sig(after)}`)
  console.log(`${same('spokenText')} fala  : "${before.spokenText}"`)
  console.log(`${same('spokenText')}      -> "${after.spokenText}"`)
}
