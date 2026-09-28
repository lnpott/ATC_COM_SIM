/**
 * PTT: a captura termina **na soltura**, em qualquer lugar da tela (F4 — resolve M2).
 *
 * Antes, o botão tinha um `pointerleave` que chamava `stopPtt()` como "rede de segurança": isso
 * encerrava a gravação quando o cursor apenas *saía* do botão com o PTT pressionado, o oposto de
 * apertar, segurar e soltar em qualquer lugar. A rede de segurança certa é `blur` da `window`, que
 * cobre soltar **fora** da janela (onde nenhum `pointerup` chega) sem abortar o hold-to-talk.
 *
 * O teste roda o app com microfone falso (harness) e observa o canal, que é o efeito observável do
 * requisito: `TRANSMITINDO` enquanto o botão está pressionado, `RECEBENDO` quando a captura termina.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadApp, until } from './dom-harness.js'

/** Microfone falso: o PTT precisa poder iniciar e encerrar sem hardware. */
function loadPttApp(tag = 'ptt') {
  return loadApp({ media: true, transcript: 'fala de teste' }, tag)
}

test('sair do botão com o PTT pressionado NÃO encerra a captura; a soltura na tela encerra (M2)', async () => {
  const harness = await loadPttApp('ptt-release')

  assert.equal(harness.element('#ptt').handlers.pointerleave, undefined, 'o botão não escuta pointerleave')
  assert.equal(harness.channelLabel(), 'LIVRE')

  harness.pressPtt()
  assert.equal(harness.channelLabel(), 'TRANSMITINDO', 'o canal ocupa com o PTT pressionado')
  // Rede de segurança do F4 ativa enquanto há operação: soltar fora da janela é coberto por blur.
  assert.equal((harness.windowListeners.get('pointerup') ?? []).length, 1)
  assert.equal((harness.windowListeners.get('blur') ?? []).length, 1)

  // O cursor sai do botão com o dedo/mouse ainda pressionado. O evento de saída não é escutado em
  // lugar nenhum (o antigo `pointerleave` do botão é o defeito M2), então nada acontece.
  for (const type of ['pointerleave', 'pointerout']) {
    for (const handler of harness.windowListeners.get(type) ?? []) handler({ type })
  }
  assert.equal(harness.channelLabel(), 'TRANSMITINDO', 'movimento do cursor não encerra a captura')

  // Soltura em qualquer lugar da tela encerra.
  harness.releasePtt({ type: 'pointerup' })
  assert.equal(harness.channelLabel(), 'RECEBENDO', 'a captura terminou e o canal ficou ocupado pelo processamento')
  await until(() => harness.pilotMessages().includes('fala de teste'), 'a gravação não virou transmissão')
  await until(() => harness.speech.spoken.length === 1, 'o controlador não respondeu à transmissão do PTT')
  harness.speech.finishSpeech()
  await until(() => harness.channelLabel() === 'LIVRE', 'o canal não voltou a livre')
  assert.deepEqual(harness.windowListeners.get('blur') ?? [], [], 'a rede de segurança é removida no fim da operação')
})

test('perder o foco da janela também encerra a captura, sem exigir `pointerup`', async () => {
  const harness = await loadPttApp('ptt-blur')

  harness.pressPtt()
  assert.equal(harness.channelLabel(), 'TRANSMITINDO')

  // Soltar fora da janela não gera `pointerup`; o `blur` é a rede de segurança.
  harness.blurWindow()
  assert.equal(harness.channelLabel(), 'RECEBENDO')
  await until(() => harness.pilotMessages().includes('fala de teste'), 'a captura não terminou com o blur da janela')
  await until(() => harness.speech.spoken.length === 1, 'o controlador não respondeu')
  harness.speech.finishSpeech()
})
