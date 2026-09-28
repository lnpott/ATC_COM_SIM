/**
 * Robustez do app oficial: armazenamento bloqueado (M1) e preferência de modelo desatualizada (B4).
 *
 * - **M1:** `preferredModelId` era lido de `localStorage` no topo do módulo, fora de qualquer
 *   guarda. Onde o acesso lança (`SecurityError` em contexto sandbox, cookies desabilitados, storage
 *   de terceiro bloqueado), o corpo do módulo não avaliava e o simulador ficava em branco — a falha
 *   de um recurso opcional derrubava o produto inteiro.
 * - **B4:** uma preferência persistida de outra sessão (modelo fora do catálogo) fazia o seletor
 *   mostrar "Automático" e o indicador dizer "preferido: …" ao mesmo tempo.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadApp, until } from './dom-harness.js'
import { prepareSpeechText } from '../src/speech.js'

test('armazenamento bloqueado não impede o simulador de funcionar (M1)', async () => {
  const harness = await loadApp({ storage: { throw: true } }, 'storage-bloqueado')

  assert.equal(harness.element('#strip-call-sign').textContent, 'PT-ABC', 'o app iniciou o cenário sem tocar no storage')
  assert.equal(harness.modelSelectValue(), '', 'sem preferência persistida, o seletor fica em automático')
  assert.match(harness.modelStatus(), /automático/)

  // E a sessão completa funciona: transmitir, decidir e falar.
  harness.submit('Solo Galeão, PT-ABC, solicito instruções de táxi')
  await until(() => harness.speech.spoken.length === 1, 'nenhuma fala foi emitida com o armazenamento bloqueado')
  assert.equal(harness.speech.spoken[0].text, prepareSpeechText(harness.atcoMessages().at(-1), 'pt'))

  // Trocar a preferência também não pode lançar.
  const select = harness.element('#model')
  select.value = select.innerHTML.includes('openrouter/free') ? 'openrouter/free' : ''
  select.handlers.change[0]()
  assert.match(harness.modelStatus(), /preferido|automático/)
})

test('preferência de modelo fora do catálogo é descartada: seletor e indicador concordam (B4)', async () => {
  const harness = await loadApp({ storage: { 'atc.preferredModelId': 'modelo/que-nao-existe:free' } }, 'pref-desatualizada')

  assert.equal(harness.modelSelectValue(), '', 'o seletor não pode exibir um valor que não está na lista')
  assert.match(harness.modelStatus(), /automático/, 'o indicador concorda com o seletor')

  // Uma preferência válida, ao contrário, vale para seletor, indicador e transporte.
  const valida = await loadApp({ storage: { 'atc.preferredModelId': 'openrouter/free' } }, 'pref-valida')
  assert.equal(valida.modelSelectValue(), 'openrouter/free')
  assert.match(valida.modelStatus(), /preferido: openrouter\/free/)
})
