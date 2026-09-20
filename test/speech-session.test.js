import assert from 'node:assert/strict'
import test from 'node:test'
import { createRecognitionSession, prepareSpeechText, selectSpeechVoice, speakTransmission } from '../src/speech.js'

function result(text, isFinal = false) {
  return Object.assign([{ transcript: text }], { isFinal })
}

function recognitionScope() {
  class Recognition {
    constructor() { Recognition.instance = this }
    start() { this.started = true }
    stop() { this.stopped = true }
    abort() { this.aborted = true }
  }
  return { Recognition, scope: { SpeechRecognition: Recognition } }
}

test('PTT acumula interim/final em ordem e envia exatamente uma transmissão longa no onend', () => {
  const { Recognition, scope } = recognitionScope()
  const previews = []
  const finals = []
  const session = createRecognitionSession({ idioma: 'pt', scope, onInterim: (text) => previews.push(text), onFinal: (text) => finals.push(text) })
  session.start()
  const recognition = Recognition.instance
  assert.equal(recognition.interimResults, true)
  assert.equal(recognition.continuous, true)
  recognition.onresult({ resultIndex: 0, results: [result('Bom dia Solo')] })
  recognition.onresult({ resultIndex: 0, results: [result('Bom dia Solo Galeão', true), result('Papa Tango')] })
  recognition.onresult({ resultIndex: 1, results: [result('Bom dia Solo Galeão', true), result('Papa Tango Alfa Bravo', true), result('posição dois informação')] })
  recognition.onresult({ resultIndex: 2, results: [result('Bom dia Solo Galeão', true), result('Papa Tango Alfa Bravo', true), result('posição dois informação Bravo VFR para o setor norte solicito instruções de táxi', true)] })
  session.stop()
  assert.equal(recognition.stopped, true)
  assert.deepEqual(finals, [])
  recognition.onend()
  recognition.onend()
  assert.deepEqual(finals, ['Bom dia Solo Galeão Papa Tango Alfa Bravo posição dois informação Bravo VFR para o setor norte solicito instruções de táxi'])
  assert.equal(previews.at(-1), finals[0])
})

test('PTT substitui interim do mesmo índice sem duplicar segmentos', () => {
  const { Recognition, scope } = recognitionScope()
  const finals = []
  const session = createRecognitionSession({ scope, onFinal: (text) => finals.push(text) })
  session.start()
  Recognition.instance.onresult({ resultIndex: 0, results: [result('Papa')] })
  Recognition.instance.onresult({ resultIndex: 0, results: [result('Papa Tango', true)] })
  Recognition.instance.onresult({ resultIndex: 1, results: [result('Papa Tango', true), result('Alfa Bravo', true)] })
  Recognition.instance.onend()
  assert.deepEqual(finals, ['Papa Tango Alfa Bravo'])
})

test('erro e abort encerram sem transmitir conteúdo parcial', () => {
  for (const mode of ['error', 'abort']) {
    const { Recognition, scope } = recognitionScope()
    const finals = []
    const errors = []
    const session = createRecognitionSession({ scope, onFinal: (text) => finals.push(text), onError: (event) => errors.push(event.error) })
    session.start()
    Recognition.instance.onresult({ resultIndex: 0, results: [result('fragmento parcial')] })
    if (mode === 'abort') session.abort()
    else Recognition.instance.onerror({ error: 'network' })
    Recognition.instance.onend()
    assert.deepEqual(finals, [], mode)
    assert.deepEqual(errors, mode === 'error' ? ['network'] : [], mode)
  }
})

test('seleciona voz por locale e qualidade, com fallback determinístico', () => {
  const voices = [
    { name: 'Zeta Basic', lang: 'pt-BR', localService: true },
    { name: 'Alpha Natural', lang: 'pt-BR', localService: false },
    { name: 'English Natural', lang: 'en-US', localService: true },
  ]
  assert.equal(selectSpeechVoice(voices, 'pt').name, 'Alpha Natural')
  assert.equal(selectSpeechVoice(voices, 'en').name, 'English Natural')
  assert.equal(selectSpeechVoice([{ name: 'French', lang: 'fr-FR' }], 'pt'), undefined)
})

test('TTS mantém uma única utterance completa e separa texto exibido da pronúncia', () => {
  class Utterance { constructor(text) { this.text = text } }
  const spoken = []
  const voice = { name: 'Português Natural', lang: 'pt-BR', localService: true }
  const scope = { SpeechSynthesisUtterance: Utterance, speechSynthesis: { getVoices: () => [voice], cancel() {}, speak: (utterance) => spoken.push(utterance) } }
  const displayed = 'PT-ABC, mudança de frequência aprovada, QNH 1013, contate em 123,45.'
  const prepared = prepareSpeechText(displayed, 'pt')
  assert.match(prepared, /Papa Tango Alfa Bravo Charlie/)
  assert.match(prepared, /um dois três vírgula quatro cinco/)
  const utterance = speakTransmission(displayed, { idioma: 'pt', scope })
  assert.equal(spoken.length, 1)
  assert.equal(spoken[0], utterance)
  assert.equal(utterance.text, prepared)
  assert.equal(utterance.voice, voice)
  assert.equal(utterance.lang, 'pt-BR')
  assert.equal(utterance.rate, 0.9)
  assert.equal(utterance.pitch, 0.96)
  assert.equal(utterance.volume, 1)
  assert.equal(displayed, 'PT-ABC, mudança de frequência aprovada, QNH 1013, contate em 123,45.')
})
