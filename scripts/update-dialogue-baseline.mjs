#!/usr/bin/env node
/**
 * Harness de caracterizacao do F0 (nao-normativo).
 *
 * Executa os roteiros de `reference/dialogue-inventory.v1.json` sobre o MESMO pipeline
 * que o navegador usa (`normalizePhraseology` -> `processTransmission` ->
 * `applyStateUpdate` -> `recordTransmission`), evoluindo um unico objeto de estado
 * turno a turno, e grava o resultado em `reference/dialogue-baseline.v1.json`.
 *
 * O snapshot descreve o comportamento ATUAL. Ele NAO e fonte de verdade operacional:
 * a verdade vem do corpus (`atc-simulator-chunks.json`) e a matriz normativa e o
 * entregavel do F3 (`reference/dialogue-regression-matrix.json`). Este arquivo existe
 * para detectar MUDANCA de comportamento durante F1/F2, para que cada diferenca seja
 * classificada de forma explicita como pretendida ou regressao.
 *
 * Uso:
 *   node scripts/update-dialogue-baseline.mjs           # regenera o snapshot
 *   node scripts/update-dialogue-baseline.mjs --check    # verifica sem escrever
 */
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { ManualSearch } from '../src/search.js'
import { getScenario } from '../src/scenarios.js'
import { applyStateUpdate, createSimulationState, recordTransmission } from '../src/state-machine.js'
import { normalizePhraseology } from '../src/normalization.js'
import { processTransmission } from '../src/pipeline.js'
import { limitedSessionContext } from '../src/llm/semantic-interpreter.js'
import { buildSessionReport, evaluateReadback } from '../src/training.js'

const INVENTORY_URL = new URL('../reference/dialogue-inventory.v1.json', import.meta.url)
const BASELINE_URL = new URL('../reference/dialogue-baseline.v1.json', import.meta.url)

export const BASELINE_AVISO = 'SNAPSHOT NAO-NORMATIVO do comportamento atual (F0). Descreve o que a implementacao FAZ hoje, nao o que ela DEVE fazer. Alteracoes so devem ocorrer de forma deliberada, com a diferenca classificada como pretendida (e encaminhada ao F3, reference/dialogue-regression-matrix.json) ou como regressao (corrigida).'

export async function loadInventory() {
  const inventory = JSON.parse(await readFile(INVENTORY_URL, 'utf8'))
  if (!Array.isArray(inventory?.roteiros) || inventory.roteiros.length === 0) {
    throw new TypeError('Inventario invalido: roteiros deve ser uma lista nao vazia.')
  }
  const seen = new Set()
  for (const roteiro of inventory.roteiros) {
    if (!roteiro?.id || seen.has(roteiro.id)) throw new TypeError(`Roteiro sem id unico: ${roteiro?.id}`)
    seen.add(roteiro.id)
    if (!roteiro.cenario || !roteiro.turnos?.length) throw new TypeError(`Roteiro incompleto: ${roteiro.id}`)
  }
  return inventory
}

function snapshotTurn({ turno, rawText, normalizedText, interpretation, decision, sessionContext, state, erroAplicacaoEstado, cotejamentoLegado }) {
  return {
    turno,
    piloto: rawText,
    normalizado: normalizedText,
    intent: interpretation?.intent ?? null,
    confidence: interpretation?.confidence ?? null,
    status: decision.status,
    reason: decision.reason,
    covered: decision.covered,
    spokenText: decision.spokenText,
    sourceIds: decision.sourceIds ?? [],
    cotejamentoLegado,
    cotejamentoSemantico: decision.readbackAssessment ? {
      classification: decision.readbackAssessment.classification,
      missing: decision.readbackAssessment.missing,
      contradictory: decision.readbackAssessment.contradictory,
    } : null,
    estadoAplicado: decision.stateUpdate !== null,
    erroAplicacaoEstado,
    fase: state.fase,
    frequencia: state.frequencia,
    posicao: state.aeronave?.posicao ?? null,
    contexto: state.contexto,
    historico: state.historico.length,
    sessaoContexto: { recentes: sessionContext.recentHistory.length, caracteres: JSON.stringify(sessionContext).length },
  }
}

/** Espelha a sequencia de `web/app.js transmit()` para o caminho deterministico. */
export async function runInventory() {
  const inventory = await loadInventory()
  const search = await ManualSearch.load()
  const roteiros = []

  for (const roteiro of inventory.roteiros) {
    const scenario = getScenario(roteiro.cenario)
    const idioma = scenario.idioma
    let state = createSimulationState(scenario)
    let lastClearance = null
    const evaluations = []
    const turnos = []

    for (const [index, turn] of roteiro.turnos.entries()) {
      const rawText = turn.piloto
      const normalizedText = normalizePhraseology(rawText)
      const sessionContext = limitedSessionContext(state)
      const cotejamentoLegado = lastClearance ? evaluateReadback({ autorizacao: lastClearance, cotejamento: normalizedText }) : null
      if (cotejamentoLegado) evaluations.push(cotejamentoLegado)
      state = recordTransmission(state, { origem: 'piloto', texto: normalizedText })
      const { interpretation, decision } = processTransmission({ text: rawText, idioma, state, search })

      if (!decision.covered) {
        turnos.push(snapshotTurn({ turno: index + 1, rawText, normalizedText, interpretation, decision, sessionContext, state, erroAplicacaoEstado: null, cotejamentoLegado }))
        continue
      }

      let erroAplicacaoEstado = null
      if (decision.stateUpdate) {
        try {
          state = applyStateUpdate(state, decision.stateUpdate)
        } catch (error) {
          // `web/app.js` deixa a excecao escapar de `transmit()`: o estado nao muda, a
          // mensagem do controlador nao entra no historico e o turno termina. Reproduzimos
          // esse desfecho e registramos o erro como parte da caracterizacao.
          erroAplicacaoEstado = `${error.name}: ${error.message}`
          turnos.push(snapshotTurn({ turno: index + 1, rawText, normalizedText, interpretation, decision, sessionContext, state, erroAplicacaoEstado, cotejamentoLegado }))
          continue
        }
      }

      state = recordTransmission(state, { origem: 'atco', texto: decision.spokenText, fontes: decision.sourceIds })
      lastClearance = decision.spokenText
      turnos.push(snapshotTurn({ turno: index + 1, rawText, normalizedText, interpretation, decision, sessionContext, state, erroAplicacaoEstado, cotejamentoLegado }))
    }

    roteiros.push({
      id: roteiro.id,
      cenario: roteiro.cenario,
      idioma,
      turnos,
      relatorio: buildSessionReport(state.historico, evaluations),
    })
  }

  return { versao: inventory.versao, geradoPor: 'scripts/update-dialogue-baseline.mjs', aviso: BASELINE_AVISO, roteiros }
}

function serialize(baseline) {
  return `${JSON.stringify(baseline, null, 2)}\n`
}

/** Diff estrutural legivel, usado pelo modo `--check` e pelos testes. */
export function diffBaseline(expected, actual, path = '') {
  const differences = []
  if (expected === actual) return differences
  const bothObjects = expected && actual && typeof expected === 'object' && typeof actual === 'object'
  if (!bothObjects) {
    differences.push(`${path || '<raiz>'}: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`)
    return differences
  }
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
  for (const key of keys) {
    const next = path ? `${path}.${key}` : key
    if (!(key in expected)) differences.push(`${next}: campo novo no resultado atual`)
    else if (!(key in actual)) differences.push(`${next}: campo ausente no resultado atual`)
    else differences.push(...diffBaseline(expected[key], actual[key], next))
  }
  return differences
}

function summarize(baseline) {
  const counts = {}
  let turnos = 0
  for (const roteiro of baseline.roteiros) {
    for (const turno of roteiro.turnos) {
      turnos += 1
      counts[turno.status] = (counts[turno.status] ?? 0) + 1
    }
  }
  return { roteiros: baseline.roteiros.length, turnos, porStatus: counts }
}

async function main() {
  const check = process.argv.includes('--check')
  const baseline = await runInventory()
  const summary = summarize(baseline)
  const serialized = serialize(baseline)

  if (check) {
    let committed
    try {
      committed = JSON.parse(await readFile(BASELINE_URL, 'utf8'))
    } catch {
      console.error('Baseline ausente. Execute `node scripts/update-dialogue-baseline.mjs` primeiro.')
      process.exitCode = 1
      return
    }
    const differences = diffBaseline(committed, baseline)
    if (differences.length) {
      console.error(`Caracterizacao divergente em ${differences.length} ponto(s):`)
      for (const difference of differences.slice(0, 40)) console.error(`  - ${difference}`)
      if (differences.length > 40) console.error(`  ... e mais ${differences.length - 40}.`)
      console.error('Classifique cada diferenca como PRETENDIDA (encaminhe ao F3) ou REGRESSAO (corrija).')
      process.exitCode = 1
      return
    }
    console.log(`Caracterizacao estavel: ${summary.roteiros} roteiro(s), ${summary.turnos} turno(s).`)
    return
  }

  await writeFile(BASELINE_URL, serialized, 'utf8')
  console.log(`Baseline gravada: ${summary.roteiros} roteiro(s), ${summary.turnos} turno(s).`)
  console.log(`Status: ${Object.entries(summary.porStatus).map(([status, count]) => `${status}=${count}`).join(', ')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
