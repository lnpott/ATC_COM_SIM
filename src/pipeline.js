import { createGroundedControllerReply } from './controller.js'
import { normalizePhraseology } from './normalization.js'
import { formulateSearch, retrieveHybrid } from './retrieval.js'
import { interpretTransmission } from './transmission.js'

export function processTransmission({ text, idioma, state, search, debug = false, interpretation: suppliedInterpretation, semanticMeta, sessionId, pttSessionId, sttCompletionMs }) {
  const normalizedText = normalizePhraseology(text)
  // Entity extraction uses the original utterance because the legacy phonetic
  // normalizer intentionally collapses words such as "Bravo" into "B".
  const interpretation = suppliedInterpretation ?? interpretTransmission(text, { idioma, state })
  const searchPlan = formulateSearch(interpretation, state)
  const retrievalStarted = performance.now()
  const retrieval = retrieveHybrid(search, searchPlan, { idioma, limite: 8 })
  const retrievalLatency = Math.round((performance.now() - retrievalStarted) * 100) / 100
  const decisionStarted = performance.now()
  const decision = createGroundedControllerReply({ text: normalizedText, idioma, state, searchResults: retrieval.expanded, interpretation })
  const decisionLatency = Math.round((performance.now() - decisionStarted) * 100) / 100
  const diagnostics = {
    sessionId, pttSessionId, rawTranscript: text, finalTranscript: text,
    normalizedText,
    interpretationMode: suppliedInterpretation ? 'llm' : 'deterministic_fallback',
    provider: semanticMeta?.provider ?? null, model: semanticMeta?.model ?? null,
    sttCompletionTime: sttCompletionMs ?? null, llmLatency: semanticMeta?.latencyMs ?? null,
    providerError: semanticMeta?.error ?? null, retrievalLatency, decisionLatency,
    structuredInterpretation: semanticMeta?.interpretation ?? null,
    intent: interpretation.intent,
    confidence: interpretation.confidence,
    entities: Object.fromEntries(Object.entries(interpretation).filter(([key, value]) => !['rawText', 'candidates', 'unknownElements'].includes(key) && value !== undefined)),
    ambiguity: interpretation.intent === 'ambiguous', sessionContextUsed: semanticMeta?.sessionContextUsed ?? null,
    normalizedQuery: searchPlan.normalized, queriesGenerated: retrieval.diagnostics.queries,
    bm25Results: retrieval.lexical.map(({ id, score }) => ({ id, score })),
    retrieved: retrieval.lexical.map(({ id, score }) => ({ id, score })),
    reranked: retrieval.diagnostics.afterRerank,
    expandedContext: retrieval.expanded.map(({ id, relatedTo }) => ({ id, relatedTo })),
    evidenceUsed: decision.sourceIds,
    decision: decision.status,
    reason: decision.reason,
    stateUpdate: decision.stateUpdate,
    responseMode: 'deterministic_grounded', responseComposerTime: 0, controllerResponse: decision.spokenText,
    ttsVoice: null, ttsLocale: idioma === 'en' ? 'en-US' : 'pt-BR',
  }
  return { normalizedText, interpretation, searchPlan, retrieval, decision, diagnostics: debug ? diagnostics : undefined }
}
