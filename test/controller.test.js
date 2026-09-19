import assert from 'node:assert/strict';
import test from 'node:test';
import { createGroundedControllerReply, detectIntent, searchPhaseForIntent } from '../src/controller.js';
import { ManualSearch } from '../src/search.js';

const state = { fase: 'solo', aeronave: { indicativo: 'PT-ABC' }, cenario: { pista_em_uso: '18', qnh: 1015 } };

test('controlador só autoriza com artigo específico recuperado', () => {
  const wrongEvidence = [{ id: 'outro', documento: 'MCA', artigo: 'Art. 1', texto: 'genérico', score: 10 }];
  assert.equal(createGroundedControllerReply({ text: 'solicito táxi', idioma: 'pt', state, searchResults: wrongEvidence }).covered, false);
  const evidence = [{ id: 'MCA-100-16-art0125', documento: 'MCA-100-16', artigo: 'Art. 125', texto: 'Instruções de táxi', score: 4 }];
  const reply = createGroundedControllerReply({ text: 'solicito táxi', idioma: 'pt', state, searchResults: evidence });
  assert.equal(reply.covered, true);
  assert.match(reply.spokenText, /pista 18, QNH 1015/);
  assert.deepEqual(reply.sourceIds, ['MCA-100-16-art0125']);
});

test('intenção escolhe a fase documental sem alterar antecipadamente o estado', () => {
  const intent = detectIntent('pronto para partida');
  assert.equal(intent.name, 'decolagem');
  assert.equal(searchPhaseForIntent(intent, 'solo'), 'decolagem');
  assert.equal(state.fase, 'solo');
});

test('fluxo funcional recupera as fontes específicas de cada autorização', async () => {
  const search = await ManualSearch.load();
  const cases = [
    ['solicito instruções de táxi', 'solo', 'MCA-100-16-art0125'],
    ['pronto para partida', 'decolagem', 'MCA-100-16-art0126'],
    ['autorizado aproximação ILS', 'aproximacao', 'MCA-100-16-art0114'],
    ['final, solicito pouso', 'pouso', 'MCA-100-16-art0132'],
    ['mayday falha de motor', 'emergencia', 'MCA-100-16-art0064'],
  ];
  for (const [text, fase_de_voo, expectedId] of cases) {
    const searchResults = search.search({ texto: text, idioma: 'pt', fase_de_voo, limite: 8 });
    const reply = createGroundedControllerReply({ text, idioma: 'pt', state, searchResults });
    assert.equal(reply.covered, true, text);
    assert.deepEqual(reply.sourceIds, [expectedId], text);
  }
});
