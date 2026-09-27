/**
 * Política de fonia (F7 — resolve A3.9).
 *
 * Regra única, testável e fora do DOM: **toda fala do controlador é falada**, tenha ela cobertura
 * documental ou não. Pedido de esclarecimento, recusa por ausência de base recuperada, dado de
 * sessão ausente e fonte externa não integrada são fala do controlador como qualquer outra — a
 * imersão de fonia é o objetivo do treino, e tratar essas respostas como "só texto" quebrava
 * exatamente o que se treina.
 *
 * O único silêncio legítimo é a ausência de fala do controlador (erro local de captura, microfone
 * negado, falha de STT): nesses casos a mensagem não vem de `reply.spokenText`.
 */

/** Status cujo texto, ainda assim, É falado. A lista existe para documentar que ela é vazia. */
export const NEVER_SPOKEN_STATUSES = Object.freeze([])

export function shouldSpeak(reply) {
  if (!reply) return false
  if (NEVER_SPOKEN_STATUSES.includes(reply.status)) return false
  return typeof reply.spokenText === 'string' && reply.spokenText.trim().length > 0
}

/** Motivo do silêncio, para diagnóstico — nunca inventa uma fala ausente. */
export function silenceReason(reply) {
  if (!reply || typeof reply.spokenText !== 'string' || !reply.spokenText.trim()) return 'no-controller-speech'
  if (NEVER_SPOKEN_STATUSES.includes(reply.status)) return `status:${reply.status}`
  return null
}

/** Fala do controlador é falada mesmo sem cobertura documental (o enunciado cobre os dois ramos). */
export function speaksWithoutCoverage(reply) {
  return shouldSpeak(reply) && reply.covered === false
}
