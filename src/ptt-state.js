/**
 * Máquina de estados do canal de rádio (F4) — resolve A3.10.
 *
 * Antes, o rótulo visível do PTT expunha os **estágios internos do pipeline**
 * (`recording`, `transcribing`, `interpreting`, `searching`, `responding`), que são detalhes de
 * implementação (STT, LLM, busca). Um canal de rádio real tem três estados observáveis:
 *
 * - `livre`: ninguém transmitindo; o PTT está disponível;
 * - `transmitindo`: é o próprio piloto com o PTT pressionado (equivale ao `recording` interno);
 * - `recebendo`: a frequência está ocupada pela resposta do controlador — captura, STT,
 *   interpretação, busca, decisão e **reprodução do TTS** colapsados em um único estado. Enquanto
 *   `recebendo`, o PTT fica bloqueado (half-duplex: não se transmite por cima do controlador).
 *
 * Os estágios finos continuam existindo como diagnóstico (`window.__ATC_DEBUG__`), não como rótulo.
 */

export const CHANNEL_STATES = Object.freeze({
  LIVRE: 'livre',
  TRANSMITINDO: 'transmitindo',
  RECEBENDO: 'recebendo',
})

export const CHANNEL_LABELS = Object.freeze({
  [CHANNEL_STATES.LIVRE]: 'PRESSIONE PARA FALAR',
  [CHANNEL_STATES.TRANSMITINDO]: 'TRANSMITINDO…',
  [CHANNEL_STATES.RECEBENDO]: 'RECEBENDO…',
})

/** Estágios internos do pipeline que continuam existindo apenas no diagnóstico. */
export const PIPELINE_STAGES = Object.freeze(['recording', 'transcribing', 'interpreting', 'searching', 'responding'])
const RECEIVING_STAGES = Object.freeze(['transcribing', 'interpreting', 'searching', 'responding'])

/** Traduz o estágio interno para o estado de canal exibido. */
export function channelStateForStage(stage) {
  if (stage === 'recording') return CHANNEL_STATES.TRANSMITINDO
  if (RECEIVING_STAGES.includes(stage)) return CHANNEL_STATES.RECEBENDO
  return CHANNEL_STATES.LIVRE
}

/**
 * Reducer puro. Eventos:
 * - `press`: o piloto apertou o PTT (só sai de `livre`);
 * - `stage`: estágio anunciado pelo pipeline;
 * - `speechStart` / `speechEnd`: o áudio de resposta começou/terminou.
 */
export function reduceChannel(state, event) {
  switch (event?.type) {
    case 'press':
      return state === CHANNEL_STATES.LIVRE ? CHANNEL_STATES.TRANSMITINDO : state
    case 'stage':
      return channelStateForStage(event.stage)
    case 'speechStart':
      return CHANNEL_STATES.RECEBENDO
    case 'speechEnd':
      return CHANNEL_STATES.LIVRE
    default:
      return state
  }
}

export function createChannelStateMachine({ initial = CHANNEL_STATES.LIVRE, onChange } = {}) {
  let state = initial
  const notify = () => onChange?.(state)
  return {
    get state() { return state },
    /** Meia-duplex: transmitir só quando o canal está livre. */
    get canTransmit() { return state === CHANNEL_STATES.LIVRE },
    dispatch(event) {
      const next = reduceChannel(state, event)
      if (next === state) return state
      state = next
      notify()
      return state
    },
  }
}
