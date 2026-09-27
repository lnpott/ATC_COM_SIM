/**
 * Gestão de contexto e janela de tokens dos candidatos gratuitos (F6 — resolve A3.12).
 *
 * Antes, `limitedSessionContext` cortava sempre as **2 últimas transmissões** e 2.000 caracteres
 * de transcrição, iguais para qualquer modelo. Candidatos `:free` têm janelas de contexto muito
 * diferentes, e o corte fixo não tinha relação com nenhuma delas.
 *
 * De onde vem a janela (decisão C4 do plano): do **catálogo público do OpenRouter**
 * (`GET /api/v1/models` → `context_length`), que a validação gratuita já consulta a cada janela de
 * cache. Nada é presumido nem escrito à mão por fornecedor. Quando o catálogo não traz o metadado
 * (ausente ou zero), o orçamento cai no teto conservador — nunca no maior valor conhecido (risco
 * I11) — e o motivo fica registrado em `source`.
 *
 * Ordem de precedência do orçamento:
 * 1. configuração explícita do operador (`LLM_CONTEXT_BUDGETS` / `LLM_CONTEXT_BUDGET_DEFAULT`);
 * 2. janela real do candidato menos a reserva de resposta;
 * 3. teto conservador (`DEFAULT_INPUT_BUDGET_TOKENS`).
 *
 * O objetivo do módulo não é cortar mais: é cortar o **excedente** de cada candidato em vez de
 * descartar evidência por um limite arbitrário, e permitir que um candidato seja pulado sem
 * chamada de rede quando nem o corte mínimo couber.
 */

export const DEFAULT_INPUT_BUDGET_TOKENS = 8_000
/**
 * Reserva para a resposta do modelo. A chamada pede `max_tokens: 1200` e ainda tem o custo do
 * envelope JSON do structured output; 2.000 deixa margem sem reduzir o contexto útil.
 */
export const RESPONSE_RESERVE_TOKENS = 2_000
/** Heurística declarada: ~4 caracteres por token. Serve para decidir corte, não para medir custo. */
const CHARS_PER_TOKEN = 4

export function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function parseBudgets(env) {
  const raw = env?.LLM_CONTEXT_BUDGETS
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Orçamento configurado explicitamente para o candidato; `null` quando o operador não definiu. */
export function configuredBudget(provider, model, env = process.env) {
  const table = parseBudgets(env)
  const perModel = table?.[provider]?.[model] ?? table?.[`${provider}:${model}`]
  if (Number.isFinite(perModel) && perModel > 0) return perModel
  const fallback = Number(env?.LLM_CONTEXT_BUDGET_DEFAULT)
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null
}

/** Orçamento de entrada (tokens) para o candidato; configuração do operador ou teto conservador. */
export function budgetFor(provider, model, env = process.env) {
  return configuredBudget(provider, model, env) ?? DEFAULT_INPUT_BUDGET_TOKENS
}

/**
 * Orçamento derivado da janela real do candidato (`context_length` do catálogo).
 * `null` quando o metadado não existe — tratar como desconhecido, nunca estimar por analogia.
 */
export function budgetFromContextLength(contextLength, env = process.env) {
  const configuredReserve = Number(env?.LLM_CONTEXT_RESERVE_TOKENS)
  const reserve = Number.isFinite(configuredReserve) && configuredReserve >= 0 ? configuredReserve : RESPONSE_RESERVE_TOKENS
  if (!Number.isFinite(contextLength) || contextLength <= 0) return null
  return Math.max(0, Math.floor(contextLength) - reserve)
}

/** Orçamento efetivo do candidato e a origem do número, para auditoria em `?debug=1`. */
export function resolveBudget({ provider, model, contextLength = null, env = process.env } = {}) {
  const configured = configuredBudget(provider, model, env)
  if (configured) return { budget: configured, source: 'configured', contextLength: null }
  const fromCatalog = budgetFromContextLength(contextLength, env)
  if (fromCatalog !== null) return { budget: fromCatalog, source: 'catalog', contextLength }
  return { budget: DEFAULT_INPUT_BUDGET_TOKENS, source: 'default', contextLength: null }
}

function fits(value, budget, estimate) {
  return estimate(value) <= budget
}

/**
 * Encurta um item de histórico (a "string longa") até ele caber, pela metade a cada passo.
 * Devolve `null` quando nem a versão mais curta útil cabe — o item é descartado em vez de virar
 * um fragmento que não representa a transmissão.
 */
function shortenHistoryItem(item, base, kept, budget, estimate) {
  if (typeof item?.text !== 'string') return null
  let text = item.text
  while (text.length > 1) {
    text = text.slice(0, Math.floor(text.length / 2))
    const candidate = { ...item, text }
    if (fits({ ...base, recentHistory: [candidate, ...kept] }, budget, estimate)) return candidate
  }
  return null
}

/**
 * Corta o **histórico** do contexto até o payload caber no orçamento.
 *
 * Invariantes protegidos — nunca cortados, porque não são histórico descartável: identidade
 * (indicativo), aeródromo, estação/frequência, fase, pista, última autorização, instrução do
 * controlador, autorização pendente, pergunta pendente, contexto de emergência e regras de voo.
 * Se nem eles couberem no orçamento, o resultado simplesmente não caberá: quem decide então é
 * `payloadFits`, e o candidato é pulado sem chamada de rede.
 */
export function trimSessionContext(context, budget, { estimate = estimateTokens } = {}) {
  const { recentHistory, ...invariants } = context ?? {}
  const history = Array.isArray(recentHistory) ? recentHistory : []
  const kept = []
  // Do mais recente para o mais antigo: perde-se primeiro o histórico antigo.
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]
    if (fits({ ...invariants, recentHistory: [item, ...kept] }, budget, estimate)) { kept.unshift(item); continue }
    const shortened = shortenHistoryItem(item, invariants, kept, budget, estimate)
    if (shortened) kept.unshift(shortened)
    break
  }
  return { ...invariants, recentHistory: kept }
}

/**
 * Aplica o corte ao payload do intérprete, respeitando o orçamento do candidato.
 * O orçamento do histórico desconta o restante do payload (transcrições e contexto de cenário):
 * o limite é do payload inteiro, não só do histórico.
 */
export function trimPayload(payload, budget, { estimate = estimateTokens } = {}) {
  if (!payload?.sessionContext) return { payload, trimmed: false, estimatedTokens: estimate(payload) }
  const { sessionContext, ...rest } = payload
  const before = Array.isArray(sessionContext.recentHistory) ? sessionContext.recentHistory.length : 0
  const overhead = estimate({ ...rest, sessionContext: { ...sessionContext, recentHistory: [] } })
  let trimmedContext = trimSessionContext(sessionContext, Math.max(0, budget - overhead), { estimate })
  let next = { ...payload, sessionContext: trimmedContext }
  // O envelope montado não é exatamente a soma das partes (chaves, chaves de objeto, vírgulas
  // contadas duas vezes). Se o payload inteiro ainda não couber, cede o histórico mais antigo.
  while (!payloadFits(next, budget, { estimate }) && trimmedContext.recentHistory.length) {
    trimmedContext = { ...trimmedContext, recentHistory: trimmedContext.recentHistory.slice(1) }
    next = { ...payload, sessionContext: trimmedContext }
  }
  const after = trimmedContext.recentHistory.length
  return { payload: next, trimmed: after < before, estimatedTokens: estimate(next), historyBefore: before, historyAfter: after }
}

export function payloadFits(payload, budget, { estimate = estimateTokens } = {}) {
  return estimate(payload) <= budget
}
