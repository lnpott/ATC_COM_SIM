/**
 * Camada de conhecimento (F1).
 *
 * Responsabilidades:
 * 1. formular a consulta de recuperação a partir da regra documental da intenção;
 * 2. resolver a **cobertura** da comunicação: qual variante documentada se aplica, se falta
 *    informação do piloto, se falta dado da sessão/cenário ou se o dado é externo;
 * 3. devolver apenas fontes que o BM25 realmente recuperou.
 *
 * O que esta camada NÃO faz: autorizar, compor procedimento, alterar estado ou inventar
 * fraseologia. Ela decide **o que está documentado**, não **o que o controlador fala**.
 */
import { EVIDENCE_RULES, evidenceRule, PENDING_FAMILIES, selectVariant } from './knowledge/evidence-rules.js'

export const COVERAGE = Object.freeze({
  DEMONSTRATED: 'documented',
  NEEDS_CLARIFICATION: 'needs_clarification',
  SESSION_CONTEXT_MISSING: 'session_context_missing',
  EXTERNAL_SOURCE_UNAVAILABLE: 'external_source_unavailable',
  COVERAGE_INSUFFICIENT: 'coverage_insufficient',
  NOT_UNDERSTOOD: 'not_understood',
})

export const COVERAGE_REASON = Object.freeze({
  GROUNDED: 'grounded',
  MISSING_PILOT_INFORMATION: 'missing-pilot-information',
  MISSING_SESSION_CONTEXT: 'missing-session-context',
  EXTERNAL_SOURCE: 'external-source-not-integrated',
  FAMILY_NOT_IMPLEMENTED: 'family-not-implemented',
  EVIDENCE_NOT_RECOVERED: 'evidence-not-recovered',
  NO_RULE: 'no-evidence-rule',
  NOT_UNDERSTOOD: 'intent-not-understood',
})

const FOLD = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')

export function formulateSearch(interpretation, state) {
  const rule = evidenceRule(interpretation.intent)
  const language = interpretation.language === 'en' ? 'en' : 'pt'
  const semanticConcepts = (interpretation.searchConcepts ?? []).filter((concept) => typeof concept === 'string').slice(0, 10)
  const entities = [interpretation.flightRules, interpretation.destination, interpretation.runway].filter(Boolean)

  if (!rule) {
    return {
      original: interpretation.rawText, intent: interpretation.intent, language,
      normalized: semanticConcepts.join(' '), aliases: semanticConcepts,
      phase: interpretation.flightPhase ?? state.fase, expectedSources: [], rule: null, variant: null,
    }
  }

  const variant = selectVariant(rule, interpretation.rawText)
  return {
    original: interpretation.rawText,
    intent: interpretation.intent,
    language,
    normalized: [...semanticConcepts, ...rule.queries[language], ...entities].join(' '),
    aliases: [...semanticConcepts, ...rule.queries[language]],
    phase: rule.phase ?? interpretation.flightPhase ?? state.fase,
    expectedSources: variant?.sources ?? [],
    rule,
    variant,
  }
}

/** Identificadores documentais que uma comunicação pode alcançar, para busca entre idiomas. */
export function expectedSourcesFor(intent) {
  const rule = evidenceRule(intent)
  if (!rule?.coverage?.length) return []
  return [...new Set(rule.coverage.flatMap(({ sources }) => sources))]
}

function recoveredSources(variant, evidence) {
  const recovered = new Map(evidence.map(({ id }) => [id, true]))
  return variant.sources.filter((id) => recovered.has(id))
}

/**
 * Resolve a cobertura documental da comunicação.
 * Retorna um veredito com motivo explícito — nunca "sem cobertura" por falta de mapeamento.
 */
export function resolveCoverage({ interpretation, state, evidence, plan }) {
  const intent = interpretation.intent
  const language = interpretation.language === 'en' ? 'en' : 'pt'
  const base = { intent, language, plan, rule: plan.rule ?? null, variant: plan.variant ?? null }

  if (intent === 'unknown' || intent === 'ambiguous') {
    return { ...base, status: COVERAGE.NOT_UNDERSTOOD, reason: COVERAGE_REASON.NOT_UNDERSTOOD, sources: [], citation: null }
  }

  const rule = base.rule
  if (!rule) {
    // Intenção operacional conhecida, mas sem contrato de decisão documentado nesta fase.
    // Não é ausência de cobertura no manual: é o simulador que ainda não a trata.
    const implemented = PENDING_FAMILIES.includes(intent)
    return {
      ...base,
      status: COVERAGE.COVERAGE_INSUFFICIENT,
      reason: implemented ? COVERAGE_REASON.FAMILY_NOT_IMPLEMENTED : COVERAGE_REASON.NO_RULE,
      sources: [], citation: null,
    }
  }

  const sessionContext = rule.sessionContext
  if (sessionContext?.matches(interpretation)) {
    return { ...base, status: COVERAGE.SESSION_CONTEXT_MISSING, reason: sessionContext.reason, sources: [], citation: null, message: sessionContext.message }
  }

  if (rule.external && !rule.coverage.length) {
    return { ...base, status: COVERAGE.EXTERNAL_SOURCE_UNAVAILABLE, reason: COVERAGE_REASON.EXTERNAL_SOURCE, sources: [], citation: null }
  }

  const variant = base.variant
  if (!variant) {
    return { ...base, status: COVERAGE.COVERAGE_INSUFFICIENT, reason: COVERAGE_REASON.FAMILY_NOT_IMPLEMENTED, sources: [], citation: null }
  }

  // Dado que a própria sessão deveria ter (ex.: uma autorização a cotejar) não é pergunta ao
  // piloto: é estado da sessão ausente, categoria distinta no §9 do PLANO_REF.
  const sessionRequires = variant.sessionRequires
  if (sessionRequires && !state?.contexto?.[sessionRequires.sessionField]) {
    return { ...base, status: COVERAGE.SESSION_CONTEXT_MISSING, reason: sessionRequires.reason, sources: [], citation: null, message: sessionRequires.message }
  }

  const requirement = unmetRequirement(variant, interpretation, state)
  if (requirement) {
    return { ...base, status: COVERAGE.NEEDS_CLARIFICATION, reason: COVERAGE_REASON.MISSING_PILOT_INFORMATION, requirement, sources: [], citation: null }
  }

  const sources = recoveredSources(variant, evidence)
  if (!sources.length) {
    return { ...base, status: COVERAGE.COVERAGE_INSUFFICIENT, reason: COVERAGE_REASON.EVIDENCE_NOT_RECOVERED, sources: [], citation: variant.citation }
  }

  return { ...base, status: COVERAGE.DEMONSTRATED, reason: COVERAGE_REASON.GROUNDED, sources, citation: variant.citation }
}

/**
 * Requisito de informação ainda não satisfeito.
 *
 * A informação pode vir da própria comunicação (`detect`), do contexto já confirmado da
 * sessão (`session`) ou dos dados extraídos pela interpretação (`fromInterpretation`).
 * Nada é inferido: o que não foi dito e não está confirmado precisa ser perguntado.
 */
function unmetRequirement(variant, interpretation, state) {
  const requirement = variant.requires
  if (!requirement) return null

  const spoken = FOLD(interpretation.rawText)
  const detected = (requirement.detect ?? []).some((term) => spoken.includes(FOLD(term)))
  const fromSession = requirement.sessionField ? state?.contexto?.[requirement.sessionField] : undefined
  const fromInterpretation = requirement.fromInterpretation ? interpretation[requirement.fromInterpretation] : undefined
  const provided = detected || Boolean(fromSession) || Boolean(fromInterpretation)
  if (provided) return null
  return requirement
}

export { EVIDENCE_RULES, evidenceRule }
