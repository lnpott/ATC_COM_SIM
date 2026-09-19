import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGroundedRequest, GOLDEN_RULE, validateGroundedReply } from '../src/grounding.js';
import { normalizePhraseology, expandForSpeech } from '../src/normalization.js';
import { getScenario } from '../src/scenarios.js';
import { applyStateUpdate, createSimulationState, recordTransmission } from '../src/state-machine.js';
import { buildSessionReport, evaluateReadback, explainResult } from '../src/training.js';
import { TransmissionQueue } from '../src/radio.js';
import { SimulatorSession } from '../src/simulator.js';
import { createBrowserRecognizer, speakTransmission } from '../src/speech.js';

test('normaliza alfabeto, algarismos e saída para TTS', () => {
  assert.equal(normalizePhraseology('papa tango alfa bravo dois nove nove dois'), 'PTAB 2992');
  assert.equal(expandForSpeech('RWY 28 QNH 1013 FL100'), 'pista dois oito QNH um zero um três nível de voo um zero zero');
});

test('máquina de estados valida transições e preserva histórico', () => {
  const scenario = getScenario('vfr_local_pt');
  let state = createSimulationState(scenario);
  state = recordTransmission(state, { origem: 'piloto', texto: 'pronto para partida' });
  state = applyStateUpdate(state, { fase: 'decolagem', frequencia: 'torre' });
  assert.equal(state.fase, 'decolagem');
  assert.equal(state.historico[0].sequencia, 1);
  assert.throws(() => applyStateUpdate(state, { fase: 'pouso' }), /transição inválida/);
});

test('grounding recusa ausência de cobertura e valida fontes do modelo', () => {
  const denied = buildGroundedRequest({ texto: 'marte', idioma: 'pt', estado: {}, resultados: [{ score: 0 }] });
  assert.deepEqual(denied, { coberto: false, resposta: 'Não há cobertura documental.', contexto: [] });
  const request = buildGroundedRequest({ texto: 'táxi', idioma: 'pt', estado: {}, resultados: [{ id: 'fonte-1', documento: 'MCA', artigo: 'Art. 1', texto: 'trecho', score: 2 }] });
  assert.ok(request.system.includes(GOLDEN_RULE));
  assert.equal(validateGroundedReply({ texto_falado: 'ok', ids_fontes: ['fonte-1'] }, request).texto_falado, 'ok');
  assert.throws(() => validateGroundedReply({ texto_falado: 'não', ids_fontes: ['inventada'] }, request), /não recuperada/);
});

test('avalia cotejamento, explica fonte e consolida relatório', () => {
  const evaluation = evaluateReadback({ autorizacao: 'pista 18, QNH 1013, proa 090', cotejamento: 'pista 18, QNH 1013' });
  assert.deepEqual(evaluation.omitidos, ['proa']);
  assert.equal(explainResult({ id: 'x', documento: 'MCA', artigo: 'Art. 1', texto: 'regra' }).citacao, 'MCA, Art. 1');
  assert.deepEqual(buildSessionReport([{}], [evaluation]), { transmissoes: 1, avaliacoes: 1, score: 67, erros_recorrentes: { proa: 1 } });
  assert.deepEqual(evaluateReadback({ autorizacao: 'runway 18, heading 090', cotejamento: 'runway 18' }).omitidos, ['proa']);
});

test('fila de transmissões serializa tráfego simultâneo', async () => {
  const queue = new TransmissionQueue();
  const order = [];
  const first = queue.enqueue(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); order.push('A'); });
  const second = queue.enqueue(async () => { order.push('B'); });
  await Promise.all([first, second]);
  assert.deepEqual(order, ['A', 'B']);
});

test('sessão integra normalização, busca e grounding sem acoplar um LLM', () => {
  const search = { search: ({ texto, idioma, fase_de_voo }) => [{ id: 'fonte', documento: 'MCA', artigo: 'Art. 1', texto: `${texto}/${idioma}/${fase_de_voo}`, score: 1 }] };
  const session = new SimulatorSession({ search });
  const request = session.prepareTransmission('papa tango alfa bravo pronto');
  assert.equal(request.coberto, true);
  assert.match(request.contexto[0].trecho, /^PTAB pronto\/pt\/solo$/);
  assert.equal(session.acceptReply({ texto_falado: 'PT-ABC, aguarde', ids_fontes: ['fonte'] }, request), 'PT-ABC, aguarde');
  assert.equal(session.state.historico.length, 2);
});

test('adaptadores Web Speech configuram idioma e mantêm dependências injetáveis', () => {
  class Recognition {}
  class Utterance { constructor(text) { this.text = text; } }
  const spoken = [];
  const scope = { SpeechRecognition: Recognition, SpeechSynthesisUtterance: Utterance, speechSynthesis: { speak: (value) => spoken.push(value) } };
  const recognition = createBrowserRecognizer({ idioma: 'en', onResult: () => {}, scope });
  assert.equal(recognition.lang, 'en-US');
  const utterance = speakTransmission('RWY 28', { idioma: 'en', scope });
  assert.equal(utterance.text, 'runway two eight');
  assert.deepEqual(spoken, [utterance]);
});
