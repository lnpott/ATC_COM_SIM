const PROFILES = Object.freeze({
  taxi_request: { phase: 'solo', source: 'MCA-100-16-artigo-0125-001', pt: ['instruções táxi solicitação autorização ponto espera'], en: ['taxi instructions request clearance holding point'] },
  takeoff_request: { phase: 'decolagem', source: 'MCA-100-16-artigo-0126-001', pt: ['instruções decolagem pronto partida autorização'], en: ['takeoff departure ready clearance runway'] },
  traffic_circuit: { phase: 'aproximacao', source: 'MCA-100-16-artigo-0129-001', pt: ['entrada circuito tráfego autorização pista vento qnh'], en: ['join traffic pattern clearance runway wind altimeter'] },
  approach_request: { phase: 'aproximacao', source: 'MCA-100-16-artigo-0114-001', pt: ['autorização aproximação procedimento'], en: ['approach clearance procedure'] },
  landing_request: { phase: 'pouso', source: 'MCA-100-16-artigo-0132-001', pt: ['autorização pouso pista final vento'], en: ['landing clearance runway final wind'] },
  emergency: { phase: 'emergencia', source: 'MCA-100-16-artigo-0064-001', pt: ['mayday emergência falha motor posição intenção'], en: ['mayday emergency engine failure position intentions'] },
  frequency_change: { phase: 'rota', source: 'MCA-100-16-artigo-0059-001', pt: ['troca frequência aprovada comunicação subida descida'], en: ['frequency change approved communication climb descent'] },
  vfr_departure: { phase: 'solo', source: 'MCA-100-16-artigo-0122-001', pt: ['informações partida voo VFR pista qnh'], en: ['departure information VFR runway altimeter'] },
  readback: { phase: 'solo', source: 'MCA-100-16-artigo-0012-001', pt: ['cotejamento autorização pista táxi frequência'], en: ['readback clearance runway taxi frequency'] },
  weather_request: { phase: 'geral', pt: ['solicitação meteorologia detalhada'], en: ['detailed weather request'] },
})

/**
 * Língua original dos documentos da base (MCA 100-16 e ICA 100-12): os artigos
 * normativos são redigidos em português. A coluna em inglês do manual cobre a
 * fraseologia, não todo o texto regulamentar.
 */
export const ORIGINAL_LANGUAGE = 'pt'
export const ORIGINAL_LANGUAGE_REASON = 'original-language-fallback'

function publicResult(chunk, score, extra = {}) {
  return { id: chunk.id, documento: chunk.doc, artigo: chunk.artigo, idioma: chunk.idioma, fases: [...chunk.fases], score: Number(score.toFixed(6)), texto: chunk.texto, ...extra }
}

export function formulateSearch(interpretation, state) {
  const profile = PROFILES[interpretation.intent]
  if (!profile) return { original: interpretation.rawText, intent: interpretation.intent, normalized: (interpretation.searchConcepts ?? []).join(' '), aliases: interpretation.searchConcepts ?? [], phase: interpretation.flightPhase ?? state.fase, targetSource: undefined }
  const language = interpretation.language === 'en' ? 'en' : 'pt'
  const entities = [interpretation.flightRules, interpretation.destination, interpretation.runway].filter(Boolean)
  const semanticConcepts = (interpretation.searchConcepts ?? []).filter((concept) => typeof concept === 'string').slice(0, 10)
  return {
    original: interpretation.rawText,
    intent: interpretation.intent,
    normalized: [...semanticConcepts, ...profile[language], ...entities].join(' '),
    aliases: [...semanticConcepts, ...profile[language]],
    phase: profile.phase ?? interpretation.flightPhase ?? state.fase,
    targetSource: profile.source,
  }
}

/**
 * Recupera a fonte normativa na língua original do manual quando a língua da sessão
 * não a alcança.
 *
 * Motivo (lacuna A3.14 de docs/REFATOR_DEEP.md): a provisão de cotejamento — MCA 100-16
 * art. 12 (III, § 1º e § 2º) e art. 45 — só existe na coluna em português, porque os
 * artigos normativos do manual (arts. 1 a 55) não têm tradução; a coluna em inglês cobre
 * as tabelas de fraseologia. Sem esta passagem, uma sessão em inglês declara "ausência de
 * cobertura documental" para um ato que ESTÁ documentado, o que o PLANO_REF §10 proíbe.
 *
 * O conceito e a fraseologia correspondente existem nos dois idiomas no próprio corpus:
 * art. 39 (glossário pt-en, "COTEJE / READ BACK") e art. 138 (pt-en, "cotejamento
 * correto / your read back is correct").
 *
 * A busca é feita com os termos documentados do perfil na língua original e só aceita o
 * resultado se o BM25 realmente o tiver recuperado: o artigo nunca é injetado por ID
 * (ver docs/PIPELINE_CONTEXTUAL.md).
 */
function findOriginalLanguageSource(search, plan, idioma) {
  if (!plan.targetSource || idioma === ORIGINAL_LANGUAGE) return null
  const profile = PROFILES[plan.intent]
  if (!profile) return null
  const [recovered] = search.search({ texto: profile[ORIGINAL_LANGUAGE].join(' '), idioma: ORIGINAL_LANGUAGE, fase_de_voo: plan.phase, limite: 8 }).filter(({ id }) => id === plan.targetSource)
  if (!recovered) return null
  return { ...recovered, retrievalReasons: [ORIGINAL_LANGUAGE_REASON] }
}

/** Combines lexical BM25, normalized intent queries, metadata priors and logical neighbors. */
export function retrieveHybrid(search, plan, { idioma = 'pt', limite = 8 } = {}) {
  if (!plan.normalized) return { results: [], lexical: [], expanded: [], diagnostics: { queries: [plan.original], targetSource: plan.targetSource, originalLanguageFallback: false, fallbackSourceIds: [] } }
  const queries = [plan.original, plan.normalized, ...plan.aliases]
  const runs = queries.map((texto) => search.search({ texto, idioma, fase_de_voo: plan.phase, limite: 8 }))
  const merged = new Map()
  runs.forEach((results, runIndex) => results.forEach((result, rank) => {
    const current = merged.get(result.id) ?? { ...result, hybridScore: 0, reasons: [] }
    current.hybridScore += 1 / (20 + rank) + Math.min(result.score / 100, 0.2)
    current.reasons.push(runIndex === 0 ? 'bm25-original' : 'intent-query')
    merged.set(result.id, current)
  }))
  // Metadata boosts only a document that was actually found by a retrieval run;
  // it never injects an article solely because an intent suggested it.
  const target = plan.targetSource && merged.get(plan.targetSource)
  if (target) { target.hybridScore += 0.3; target.reasons.push('intent-metadata') }
  const ranked = [...merged.values()].sort((a, b) => b.hybridScore - a.hybridScore || b.score - a.score)
  const selected = ranked.slice(0, limite).map(({ hybridScore, reasons, ...result }) => ({ ...result, score: Number(hybridScore.toFixed(6)), retrievalReasons: [...new Set(reasons)] }))
  // Evidência normativa fora da língua da sessão não é caso de ranking: ela entra para que a
  // decisão possa citar a fonte real, e o diagnóstico registra o motivo. A passagem só ocorre
  // quando a língua da sessão **não** recuperou a fonte esperada; se ela foi recuperada e ficou
  // fora da janela, a causa é de ranking, não de língua, e o rótulo não pode mentir.
  const recoveredInSessionLanguage = Boolean(plan.targetSource && merged.has(plan.targetSource))
  const originalLanguageSource = recoveredInSessionLanguage ? null : findOriginalLanguageSource(search, plan, idioma)
  if (originalLanguageSource) selected.push(originalLanguageSource)
  const expanded = expandContext(search.index.chunks, selected, idioma)
  return {
    results: selected,
    lexical: runs[0],
    expanded,
    diagnostics: {
      queries, targetSource: plan.targetSource,
      originalLanguageFallback: Boolean(originalLanguageSource), fallbackSourceIds: originalLanguageSource ? [originalLanguageSource.id] : [],
      beforeRerank: [...merged.values()].map(({ id, score, hybridScore }) => ({ id, lexicalScore: score, hybridScore: Number(hybridScore.toFixed(6)) })),
      afterRerank: selected.map(({ id, score, retrievalReasons }) => ({ id, score, retrievalReasons })),
    },
  }
}

function expandContext(chunks, results, idioma) {
  const byId = new Map(results.map((result) => [result.id, result]))
  for (const result of results.slice(0, 3)) {
    const position = chunks.findIndex(({ id }) => id === result.id)
    const chunk = chunks[position]
    for (const neighbor of [chunks[position - 1], chunks[position + 1]]) {
      if (!neighbor || byId.has(neighbor.id) || !neighbor.idioma.split('-').includes(idioma)) continue
      const sameLogicalSection = neighbor.documento === chunk.documento && (neighbor.artigo === chunk.artigo || (neighbor.secao && neighbor.secao === chunk.secao))
      if (sameLogicalSection) byId.set(neighbor.id, publicResult(neighbor, result.score * 0.5, { retrievalReasons: ['logical-neighbor'], relatedTo: result.id }))
    }
  }
  return [...byId.values()]
}

export function retrievalProfile(intent) { return PROFILES[intent] }
