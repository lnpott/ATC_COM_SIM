import { createGroundedControllerReply } from './controller.js'
import { normalizePhraseology } from './normalization.js'
import { formulateSearch, retrieveHybrid } from './retrieval.js'
import { interpretTransmission } from './transmission.js'

export function processTransmission({ text, idioma, state, search, debug = false }) {
  const normalizedText = normalizePhraseology(text)
  // Entity extraction uses the original utterance because the legacy phonetic
  // normalizer intentionally collapses words such as "Bravo" into "B".
  const interpretation = interpretTransmission(text, { idioma, state })
  const searchPlan = formulateSearch(interpretation, state)
  const retrieval = retrieveHybrid(search, searchPlan, { idioma, limite: 8 })
  const decision = createGroundedControllerReply({ text: normalizedText, idioma, state, searchResults: retrieval.expanded, interpretation })
  const diagnostics = {
    receivedText: text,
    normalizedText,
    intent: interpretation.intent,
    confidence: interpretation.confidence,
    entities: Object.fromEntries(Object.entries(interpretation).filter(([key, value]) => !['rawText', 'candidates', 'unknownElements'].includes(key) && value !== undefined)),
    normalizedQuery: searchPlan.normalized,
    retrieved: retrieval.lexical.map(({ id, score }) => ({ id, score })),
    reranked: retrieval.diagnostics.afterRerank,
    expandedContext: retrieval.expanded.map(({ id, relatedTo }) => ({ id, relatedTo })),
    evidenceUsed: decision.sourceIds,
    decision: decision.status,
    reason: decision.reason,
    stateUpdate: decision.stateUpdate,
  }
  return { normalizedText, interpretation, searchPlan, retrieval, decision, diagnostics: debug ? diagnostics : undefined }
}
