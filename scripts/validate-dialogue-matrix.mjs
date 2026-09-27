#!/usr/bin/env node
/**
 * Validador da matriz normativa de regressão de diálogo (F3).
 *
 * Roda **antes** dos testes e barra erros que o teste de execução não distingue de uma falha de
 * pipeline: `fonte` que não existe no corpus, `intent` desconhecido, `status` fora da taxonomia,
 * expectativa de cotejamento exigindo campo que o Art. 12, III não permite (vento, meteorologia),
 * ou fonte citada que não pertence à regra documental da própria intenção.
 *
 * Uso: node scripts/validate-dialogue-matrix.mjs
 */
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { COVERAGE } from '../src/knowledge.js'
import { EVIDENCE_RULES, PENDING_FAMILIES } from '../src/knowledge/evidence-rules.js'
import { MANDATORY_FIELDS, NEVER_REQUIRED_FIELDS } from '../src/readback-rules.js'
import { ManualSearch } from '../src/search.js'
import { SCENARIOS } from '../src/scenarios.js'
import { FLIGHT_PHASES } from '../src/state-machine.js'

const MATRIX_URL = new URL('../reference/dialogue-regression-matrix.json', import.meta.url)
const LEXICAL_INTENTS = new Set(['ambiguous', 'unknown'])
const COVERAGE_STATUSES = new Set(Object.values(COVERAGE))

export async function loadMatrix() {
  const matrix = JSON.parse(await readFile(MATRIX_URL, 'utf8'))
  if (!Array.isArray(matrix?.roteiros) || matrix.roteiros.length === 0) throw new TypeError('matriz inválida: roteiros deve ser uma lista não vazia')
  return matrix
}

/** Fontes que a regra documental da intenção admite (coverage + alternatives). */
function documentedSources(intent) {
  const rule = EVIDENCE_RULES[intent]
  if (!rule?.coverage?.length) return null
  return new Set(rule.coverage.flatMap((variant) => [...(variant.sources ?? []), ...(variant.alternatives ?? [])]))
}

export async function validateMatrix({ search } = {}) {
  const matrix = await loadMatrix()
  const index = search ?? (await ManualSearch.load())
  const chunkIds = new Set(index.index.chunks.map(({ id }) => id))
  const problems = []
  const seen = new Set()

  if (!matrix.aviso?.includes('NORMATIVO')) problems.push('a matriz precisa se declarar NORMATIVA no campo `aviso`')

  for (const roteiro of matrix.roteiros) {
    const where = roteiro?.id ?? '<roteiro sem id>'
    if (!roteiro?.id) problems.push('roteiro sem id')
    else if (seen.has(roteiro.id)) problems.push(`id duplicado: ${roteiro.id}`)
    seen.add(roteiro?.id)
    if (!(roteiro?.cenario in SCENARIOS)) problems.push(`${where}: cenário desconhecido ${roteiro?.cenario}`)
    if (!['pt', 'en'].includes(roteiro?.idioma)) problems.push(`${where}: idioma inválido ${roteiro?.idioma}`)
    if (roteiro?.cenario in SCENARIOS && roteiro.idioma !== SCENARIOS[roteiro.cenario].idioma) problems.push(`${where}: idioma não corresponde ao cenário (${SCENARIOS[roteiro.cenario].idioma})`)
    if (!roteiro?.fundamento) problems.push(`${where}: sem fundamento documental declarado`)
    if (!roteiro?.turnos || roteiro.turnos.length < 2) {
      problems.push(`${where}: um roteiro de sequência precisa de ao menos dois turnos`)
      continue
    }

    for (const [index_, turn] of roteiro.turnos.entries()) {
      const label = `${where}.turno${index_ + 1}`
      if (typeof turn?.piloto !== 'string' || !turn.piloto.trim()) problems.push(`${label}: fala do piloto ausente`)
      const espera = turn?.espera
      if (!espera) {
        problems.push(`${label}: sem expectativa`)
        continue
      }
      if (!LEXICAL_INTENTS.has(espera.intent) && !(espera.intent in EVIDENCE_RULES) && !PENDING_FAMILIES.includes(espera.intent)) problems.push(`${label}: intent desconhecido ${espera.intent}`)
      if (!COVERAGE_STATUSES.has(espera.status)) problems.push(`${label}: status fora da taxonomia ${espera.status}`)
      if (!FLIGHT_PHASES.includes(espera.fase)) problems.push(`${label}: fase inválida ${espera.fase}`)
      if (typeof espera.frequencia !== 'string' || !espera.frequencia) problems.push(`${label}: frequência ausente`)

      const fontes = espera.fontes ?? []
      const allowed = documentedSources(espera.intent)
      for (const fonte of fontes) {
        if (!chunkIds.has(fonte)) problems.push(`${label}: fonte inexistente no corpus ${fonte}`)
        if (allowed && !allowed.has(fonte)) problems.push(`${label}: fonte ${fonte} não pertence à regra documental de ${espera.intent}`)
      }
      if (espera.status === COVERAGE.DEMONSTRATED && !fontes.length) problems.push(`${label}: cobertura demonstrada sem fonte citada`)
      if (espera.status !== COVERAGE.DEMONSTRATED && fontes.length && espera.status !== COVERAGE.NEEDS_CLARIFICATION) {
        problems.push(`${label}: status ${espera.status} não pode citar fonte como cobertura`)
      }
      if (espera.intent === 'readback' && espera.cotejamento) {
        const { obrigatorios = [], informativos = [], classificacao } = espera.cotejamento
        if (!['correct', 'incomplete', 'contradictory'].includes(classificacao)) problems.push(`${label}: classificação de cotejamento inválida ${classificacao}`)
        for (const campo of obrigatorios) {
          if (!MANDATORY_FIELDS.includes(campo)) problems.push(`${label}: campo obrigatório fora do Art. 12, III: ${campo}`)
          if (NEVER_REQUIRED_FIELDS.includes(campo)) problems.push(`${label}: campo ${campo} nunca pode ser obrigatório`)
        }
        for (const campo of informativos) if (obrigatorios.includes(campo)) problems.push(`${label}: campo ${campo} é obrigatório e informativo ao mesmo tempo`)
        if (classificacao === 'incomplete' && !obrigatorios.length) problems.push(`${label}: cotejamento incompleto sem campo obrigatório a omitir`)
      }
      if (espera.intent === 'readback' && !espera.cotejamento) problems.push(`${label}: turno de cotejamento sem expectativa de classificação`)
    }
  }

  return { problems, roteiros: matrix.roteiros.length, turnos: matrix.roteiros.reduce((total, roteiro) => total + (roteiro.turnos?.length ?? 0), 0), chunks: chunkIds.size }
}

async function main() {
  const { problems, roteiros, turnos } = await validateMatrix()
  if (problems.length) {
    console.error(`Matriz de diálogo inválida (${problems.length} problema(s)):`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exitCode = 1
    return
  }
  console.log(`Matriz de diálogo válida: ${roteiros} roteiro(s), ${turnos} turno(s), fontes conferidas contra o corpus.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
