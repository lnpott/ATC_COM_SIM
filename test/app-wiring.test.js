/**
 * Fiação do app oficial (F7/C1 — revisão pós-merge, execução 7).
 *
 * `web/app.js` é o único arquivo que liga decisão → estado → tela → fonia, e **nenhum** teste o
 * carregava. Quando `speakTransmission` deixou de ser importado (o ponto de chamada continuou lá),
 * a `ReferenceError` foi engolida pelo `try` de `speakReply`: canal liberado, nenhuma fala e a suíte
 * inteira verde — 105/105. Estes dois testes fecham esse buraco:
 *
 * 1. checagem de fiação — todo identificador **chamado** em `web/app.js` precisa estar vinculado
 *    (import, declaração ou global). Ela é validada contra uma cópia mutilada do próprio arquivo,
 *    para não virar um teste que passa por vacuidade;
 * 2. execução real do app contra um `document`/`SpeechSynthesis` de mentira, provando pelo caminho
 *    de produção (submit → pipeline → TTS) que a resposta do controlador é falada e que o canal só
 *    volta a `LIVRE` no fim da fonia (A3.10).
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadApp, until } from './dom-harness.js'
import { prepareSpeechText, speakTransmission } from '../src/speech.js'

const APP_PATH = new URL('../web/app.js', import.meta.url)
const SPEECH_IMPORT = "import { createRecognitionSession, speakTransmission } from '../src/speech.js';"

/** Palavras-chave e globais do navegador que `web/app.js` pode usar sem importar. */
const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'try', 'catch', 'finally', 'throw', 'return', 'function', 'class', 'new', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void', 'async', 'await', 'yield', 'super', 'this'])
const GLOBALS = new Set(['document', 'window', 'globalThis', 'localStorage', 'sessionStorage', 'location', 'navigator', 'history', 'crypto', 'performance', 'console', 'fetch', 'Response', 'Request', 'Headers', 'URL', 'URLSearchParams', 'Promise', 'Set', 'Map', 'WeakMap', 'Boolean', 'Number', 'String', 'Object', 'Array', 'JSON', 'Math', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'structuredClone', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame', 'isNaN', 'parseInt', 'parseFloat', 'Symbol', 'Intl', 'SpeechRecognition', 'webkitSpeechRecognition', 'speechSynthesis', 'SpeechSynthesisUtterance'])

/**
 * Remove comentários e o **texto** de literais, preservando o código das interpolações de template
 * (`${...}`) — é onde uma chamada sem import também apareceria. Varredura de uma passada, porque
 * template aninhado (`\`… ${a ? \`…\` : ''}\``) quebra a leitura por expressão regular.
 */
function stripLiterals(source) {
  let out = ''
  let index = 0

  const readQuoted = (quote) => {
    index += 1
    while (index < source.length) {
      if (source[index] === '\\') { index += 2; continue }
      if (source[index] === quote) { index += 1; return }
      index += 1
    }
  }

  const readTemplate = () => {
    index += 1
    while (index < source.length) {
      const char = source[index]
      if (char === '\\') { index += 2; continue }
      if (char === '`') { index += 1; return }
      if (char === '$' && source[index + 1] === '{') {
        index += 2
        const start = index
        let depth = 1
        while (index < source.length && depth > 0) {
          const inner = source[index]
          if (inner === '\\') { index += 2; continue }
          if (inner === '"' || inner === "'") { readQuoted(inner); continue }
          if (inner === '`') { readTemplate(); continue }
          if (inner === '{') depth += 1
          else if (inner === '}') { depth -= 1; if (depth === 0) break }
          index += 1
        }
        out += ` ${stripLiterals(source.slice(start, index))} `
        index += 1
        continue
      }
      index += 1
    }
  }

  while (index < source.length) {
    const char = source[index]
    if (char === '/' && source[index + 1] === '/') { while (index < source.length && source[index] !== '\n') index += 1; continue }
    if (char === '/' && source[index + 1] === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1
      index += 2
      continue
    }
    if (char === '"' || char === "'") { out += char === '"' ? '""' : "''"; readQuoted(char); continue }
    if (char === '`') { readTemplate(); continue }
    out += char
    index += 1
  }
  return out
}

/**
 * Identificadores usados em posição de chamada que não estão vinculados por import, declaração de
 * topo nem constam da lista de globais. É uma checagem de fiação, não um parser: suficiente para
 * pegar o caso real (chamada sem import) sem trazer dependência nova.
 */
export function unboundCalls(source) {
  const code = stripLiterals(source)
  const bound = new Set()
  for (const [, clause] of source.matchAll(/import\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from/g)) {
    for (const entry of clause.split(',')) {
      const name = entry.trim().split(/\s+as\s+/).pop()?.trim()
      if (name) bound.add(name)
    }
  }
  for (const [, name] of code.matchAll(/(?:^|\n)[\t ]*(?:export[\t ]+)?(?:async[\t ]+)?(?:function|class|const|let|var)[\t ]+([A-Za-z_$][\w$]*)/g)) bound.add(name)
  for (const [, list] of code.matchAll(/(?:^|\n)[\t ]*(?:export[\t ]+)?(?:const|let|var)[\t ]+([^\n=;]+?)\s*=/g)) {
    for (const entry of list.split(',')) {
      const name = entry.trim().match(/^[A-Za-z_$][\w$]*/)?.[0]
      if (name) bound.add(name)
    }
  }
  const unbound = new Set()
  for (const [, name] of code.matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)[\t ]*\(/g)) {
    if (!KEYWORDS.has(name) && !GLOBALS.has(name) && !bound.has(name)) unbound.add(name)
  }
  return [...unbound]
}

test('a fiação de web/app.js não chama identificador não vinculado (regressão de C1)', async () => {
  const source = await readFile(APP_PATH, 'utf8')

  assert.ok(source.includes(SPEECH_IMPORT), 'o import da fonia precisa vincular speakTransmission e createRecognitionSession')
  assert.equal(typeof speakTransmission, 'function', 'src/speech.js precisa exportar speakTransmission')
  assert.deepEqual(unboundCalls(source), [], 'todo identificador chamado precisa estar vinculado')

  // Controle negativo: sem o import, a checagem precisa acusar exatamente o ponto de chamada que
  // ficou órfão no PR #7. Sem isto, o teste acima poderia passar por não detectar nada.
  const mutated = source.replace(SPEECH_IMPORT, "import { createRecognitionSession } from '../src/speech.js';")
  assert.notEqual(mutated, source, 'a cópia mutilada precisa alterar o import da fonia')
  assert.deepEqual(unboundCalls(mutated), ['speakTransmission'])
})

test('o app fala a resposta do controlador e só libera o canal no fim da fonia (C1/A3.10)', async () => {
  const harness = await loadApp({}, 'fonia')

  assert.equal(harness.element('#strip-call-sign').textContent, 'PT-ABC', 'o app carregou o índice e iniciou o cenário')
  assert.match(harness.element('#system-status').innerHTML, /ÍNDICE ONLINE/, 'o app carregou o índice e iniciou o cenário')

  harness.submit('Solo Galeão, PT-ABC, solicito instruções de táxi')
  await until(() => harness.speech.spoken.length === 1, 'a resposta do controlador não foi falada')

  const reply = harness.atcoMessages().at(-1)
  assert.match(reply, /autorizado táxi/, 'a decisão documental (art. 125) chegou à tela')
  assert.equal(harness.speech.spoken[0].text, prepareSpeechText(reply, 'pt'), 'a fonia é a fala do controlador preparada para voz')
  assert.match(harness.speech.spoken[0].text, /Papa Tango Alfa Bravo Charlie/, 'o indicativo é falado foneticamente')

  // Enquanto o TTS fala, a frequência está ocupada (half-duplex): só `onend` libera.
  assert.equal(harness.channelLabel(), 'RECEBENDO', 'a frequência fica ocupada durante a fonia')
  harness.speech.finishSpeech()
  assert.equal(harness.channelLabel(), 'LIVRE', 'o canal volta a livre no fim da fonia')

  // F7/A3.9: a fala sem cobertura documental também é falada — e a pergunta passa a ser estado.
  harness.submit('PT-ABC pretende saída VFR')
  await until(() => harness.speech.spoken.length === 2, 'a pergunta de esclarecimento não foi falada')
  assert.match(harness.speech.spoken[1].text, /confirme o destino ou setor/, 'a pergunta documentada é falada, não só exibida')
  harness.speech.finishSpeech()
  assert.equal(harness.channelLabel(), 'LIVRE')
})
