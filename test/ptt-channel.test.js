/**
 * Canal de rádio (F4 — A3.10). O rótulo visível não pode expor estágios internos do pipeline, e o
 * PTT fica indisponível enquanto a frequência está ocupada pela resposta (half-duplex).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { CHANNEL_LABELS, CHANNEL_STATES, PIPELINE_STAGES, channelStateForStage, createChannelStateMachine, reduceChannel } from '../src/ptt-state.js'

test('apenas três estados de canal existem e nenhum deles é um estágio interno do pipeline', () => {
  assert.deepEqual(Object.values(CHANNEL_STATES), ['livre', 'transmitindo', 'recebendo'])
  for (const stage of PIPELINE_STAGES) assert.ok(!Object.values(CHANNEL_STATES).includes(stage), stage)
  for (const state of Object.values(CHANNEL_STATES)) assert.ok(CHANNEL_LABELS[state], `rótulo ausente para ${state}`)
})

test('estágios internos são traduzidos para estados de canal', () => {
  assert.equal(channelStateForStage('recording'), CHANNEL_STATES.TRANSMITINDO)
  for (const stage of ['transcribing', 'interpreting', 'searching', 'responding']) {
    assert.equal(channelStateForStage(stage), CHANNEL_STATES.RECEBENDO, stage)
  }
  assert.equal(channelStateForStage(undefined), CHANNEL_STATES.LIVRE)
})

test('o canal só volta a livre quando a resposta termina de tocar', () => {
  let state = CHANNEL_STATES.LIVRE
  state = reduceChannel(state, { type: 'press' })
  assert.equal(state, CHANNEL_STATES.TRANSMITINDO)
  state = reduceChannel(state, { type: 'stage', stage: 'transcribing' })
  assert.equal(state, CHANNEL_STATES.RECEBENDO)
  // O texto da resposta não libera o canal: só o fim (ou erro) da fala.
  state = reduceChannel(state, { type: 'stage', stage: 'responding' })
  assert.equal(state, CHANNEL_STATES.RECEBENDO)
  state = reduceChannel(state, { type: 'speechEnd' })
  assert.equal(state, CHANNEL_STATES.LIVRE)
})

test('PTT pressionado durante o recebimento não interrompe a resposta', () => {
  const channel = createChannelStateMachine()
  const seen = []
  channel.dispatch({ type: 'stage', stage: 'responding' })
  assert.equal(channel.canTransmit, false)
  assert.equal(channel.dispatch({ type: 'press' }), CHANNEL_STATES.RECEBENDO, 'press ignorado enquanto recebendo')
  assert.equal(channel.dispatch({ type: 'speechStart' }), CHANNEL_STATES.RECEBENDO)
  assert.equal(channel.dispatch({ type: 'speechEnd' }), CHANNEL_STATES.LIVRE)
  assert.equal(channel.canTransmit, true)
  channel.dispatch({ type: 'press' })
  assert.equal(channel.state, CHANNEL_STATES.TRANSMITINDO)
  seen.push(channel.state)
  assert.deepEqual(seen, [CHANNEL_STATES.TRANSMITINDO])
})

test('transições notificam o render uma vez por mudança de estado', () => {
  const states = []
  const channel = createChannelStateMachine({ onChange: (state) => states.push(state) })
  channel.dispatch({ type: 'press' })
  channel.dispatch({ type: 'stage', stage: 'recording' }) // já está transmitindo: sem nova notificação
  channel.dispatch({ type: 'stage', stage: 'searching' })
  channel.dispatch({ type: 'speechEnd' })
  assert.deepEqual(states, [CHANNEL_STATES.TRANSMITINDO, CHANNEL_STATES.RECEBENDO, CHANNEL_STATES.LIVRE])
})
