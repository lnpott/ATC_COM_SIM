/**
 * Recuperação híbrida (BM25 + consultas de intenção + prior de metadados + vizinhos) e busca
 * ciente de idioma.
 *
 * A formulação da consulta saiu daqui para `src/knowledge.js` (F1): o plano de busca agora vem
 * da regra documental da intenção. Este módulo permanece responsável apenas por **recuperar**.
 *
 * Língua: os documentos de base são brasileiros (MCA 100-16, ICA 100-12). O texto normativo é
 * redigido em português e a coluna em inglês cobre a fraseologia, mas o metadado `idioma` do
 * corpus não é uniforme nesse ponto (ver A3.14 e A3.18 em docs/REFATOR_DEEP.md). Por isso, se a
 * língua da sessão não recuperar uma fonte normativa esperada, a busca tenta as demais línguas
 * com o vocabulário documentado do próprio perfil e aceita o resultado **apenas se o BM25 o
 * tiver realmente recuperado** — o artigo nunca é injetado por ID (`docs/PIPELINE_CONTEXTUAL.md`).
 */
export const ORIGINAL_LANGUAGE = 'pt'
export const SEARCH_LANGUAGES = Object.freeze(['pt', 'en'])
export const ORIGINAL_LANGUAGE_REASON = 'original-language-fallback'
export const OTHER_LANGUAGE_REASON = 'other-language-fallback'

function publicResult(chunk, score, extra = {}) {
  return { id: chunk.id, documento: chunk.doc, artigo: chunk.artigo, idioma: chunk.idioma, fases: [...chunk.fases], score: Number(score.toFixed(6)), texto: chunk.texto, ...extra }
}

/**
 * Fontes normativas esperadas que a língua da sessão não alcançou, buscadas nas demais línguas.
 * Só entram resultados realmente recuperados pelo BM25; o motivo registra a língua de origem.
 */
function findCrossLanguageSources(search, plan, idioma, recoveredIds) {
  const missing = (plan.expectedSources ?? []).filter((id) => !recoveredIds.has(id))
  if (!missing.length || !plan.rule) return null
  const found = []
  for (const language of SEARCH_LANGUAGES.filter((candidate) => candidate !== idioma)) {
    const terms = plan.rule.queries?.[language]
    if (!terms?.length) continue
    const results = search.search({ texto: terms.join(' '), idioma: language, fase_de_voo: plan.phase, limite: 8 })
    for (const result of results) {
      if (!missing.includes(result.id) || found.some(({ id }) => id === result.id)) continue
      found.push({ ...result, retrievalReasons: [language === ORIGINAL_LANGUAGE ? ORIGINAL_LANGUAGE_REASON : OTHER_LANGUAGE_REASON] })
    }
  }
  return found.length ? found : null
}

/** Combines lexical BM25, normalized intent queries, metadata priors and logical neighbors. */
export function retrieveHybrid(search, plan, { idioma = 'pt', limite = 8 } = {}) {
  const emptyDiagnostics = { queries: [plan.original], targetSource: plan.expectedSources?.[0] ?? undefined, expectedSources: plan.expectedSources ?? [], originalLanguageFallback: false, fallbackSourceIds: [], fallbackLanguages: [] }
  if (!plan.normalized) return { results: [], lexical: [], expanded: [], diagnostics: emptyDiagnostics }

  const queries = [plan.original, plan.normalized, ...plan.aliases]
  const runs = queries.map((texto) => search.search({ texto, idioma, fase_de_voo: plan.phase, limite: 8 }))
  const merged = new Map()
  runs.forEach((results, runIndex) => results.forEach((result, rank) => {
    const current = merged.get(result.id) ?? { ...result, hybridScore: 0, reasons: [] }
    current.hybridScore += 1 / (20 + rank) + Math.min(result.score / 100, 0.2)
    current.reasons.push(runIndex === 0 ? 'bm25-original' : 'intent-query')
    merged.set(result.id, current)
  }))
  // Metadata boosts only a document that was actually found by a retrieval run; it never injects
  // an article solely because an intent suggested it.
  const expected = (plan.expectedSources ?? []).filter((id) => merged.get(id))
  for (const id of expected) { const target = merged.get(id); target.hybridScore += 0.3; target.reasons.push('intent-metadata') }

  const ranked = [...merged.values()].sort((a, b) => b.hybridScore - a.hybridScore || b.score - a.score)
  const selected = ranked.slice(0, limite).map(({ hybridScore, reasons, ...result }) => ({ ...result, score: Number(hybridScore.toFixed(6)), retrievalReasons: [...new Set(reasons)] }))

  // Evidência normativa fora da língua da sessão não é caso de ranking: ela entra para que a
  // decisão possa citar a fonte real, e o diagnóstico registra o motivo. A passagem só ocorre
  // quando a língua da sessão **não** recuperou a fonte esperada; se ela foi recuperada e ficou
  // fora da janela, a causa é de ranking e o rótulo não pode mentir.
  const crossLanguage = findCrossLanguageSources(search, plan, idioma, new Set(merged.keys()))
  if (crossLanguage) selected.push(...crossLanguage)
  const expanded = expandContext(search.index.chunks, selected, idioma)

  return {
    results: selected,
    lexical: runs[0],
    expanded,
    diagnostics: {
      queries,
      targetSource: plan.expectedSources?.[0] ?? undefined,
      expectedSources: plan.expectedSources ?? [],
      originalLanguageFallback: Boolean(crossLanguage?.some(({ retrievalReasons }) => retrievalReasons.includes(ORIGINAL_LANGUAGE_REASON))),
      fallbackSourceIds: crossLanguage?.map(({ id }) => id) ?? [],
      fallbackLanguages: crossLanguage ? [...new Set(crossLanguage.map(({ idioma: chunkLanguage }) => (chunkLanguage.split('-').includes('pt') ? 'pt' : 'en')))] : [],
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
