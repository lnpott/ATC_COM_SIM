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

function publicResult(chunk, score, extra = {}) {
  return { id: chunk.id, documento: chunk.doc, artigo: chunk.artigo, idioma: chunk.idioma, fases: [...chunk.fases], score: Number(score.toFixed(6)), texto: chunk.texto, ...extra }
}

export function formulateSearch(interpretation, state) {
  const profile = PROFILES[interpretation.intent]
  if (!profile) return { original: interpretation.rawText, normalized: '', aliases: [], phase: interpretation.flightPhase ?? state.fase, targetSource: undefined }
  const language = interpretation.language === 'en' ? 'en' : 'pt'
  const entities = [interpretation.flightRules, interpretation.destination, interpretation.runway].filter(Boolean)
  return {
    original: interpretation.rawText,
    normalized: [...profile[language], ...entities].join(' '),
    aliases: profile[language],
    phase: profile.phase ?? interpretation.flightPhase ?? state.fase,
    targetSource: profile.source,
  }
}

/** Combines lexical BM25, normalized intent queries, metadata priors and logical neighbors. */
export function retrieveHybrid(search, plan, { idioma = 'pt', limite = 8 } = {}) {
  if (!plan.normalized) return { results: [], lexical: [], expanded: [], diagnostics: { queries: [plan.original], targetSource: plan.targetSource } }
  const queries = [plan.original, plan.normalized, ...plan.aliases]
  const runs = queries.map((texto) => search.search({ texto, idioma, fase_de_voo: plan.phase, limite: 8 }))
  const merged = new Map()
  runs.forEach((results, runIndex) => results.forEach((result, rank) => {
    const current = merged.get(result.id) ?? { ...result, hybridScore: 0, reasons: [] }
    current.hybridScore += 1 / (20 + rank) + Math.min(result.score / 100, 0.2)
    current.reasons.push(runIndex === 0 ? 'bm25-original' : 'intent-query')
    merged.set(result.id, current)
  }))
  const target = plan.targetSource && search.index.chunks.find((chunk) => chunk.id === plan.targetSource)
  if (target && target.idioma.split('-').includes(idioma)) {
    const current = merged.get(target.id) ?? publicResult(target, 0, { hybridScore: 0, reasons: [] })
    current.hybridScore += 1
    current.reasons.push('intent-metadata')
    merged.set(target.id, current)
  }
  const ranked = [...merged.values()].sort((a, b) => b.hybridScore - a.hybridScore || b.score - a.score)
  const selected = ranked.slice(0, limite).map(({ hybridScore, reasons, ...result }) => ({ ...result, score: Number(hybridScore.toFixed(6)), retrievalReasons: [...new Set(reasons)] }))
  const expanded = expandContext(search.index.chunks, selected, idioma)
  return {
    results: selected,
    lexical: runs[0],
    expanded,
    diagnostics: { queries, targetSource: plan.targetSource, beforeRerank: [...merged.values()].map(({ id, score, hybridScore }) => ({ id, lexicalScore: score, hybridScore: Number(hybridScore.toFixed(6)) })), afterRerank: selected.map(({ id, score, retrievalReasons }) => ({ id, score, retrievalReasons })) },
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
