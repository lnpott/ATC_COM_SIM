import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ManualSearch } from '../src/search.js';

const search = await ManualSearch.load();
const fixtures = JSON.parse(await readFile(
  new URL('../reference/search-queries.v1.json', import.meta.url), 'utf8',
)).consultas;

test('recupera os trechos esperados para as consultas versionadas', () => {
  for (const fixture of fixtures.filter(({ sem_cobertura }) => !sem_cobertura)) {
    const results = search.search(fixture.entrada);
    assert.ok(results.length >= 5 && results.length <= 8, fixture.nome);
    assert.deepEqual(
      fixture.ids_esperados.filter((id) => !results.some((result) => result.id === id)),
      [],
      fixture.nome,
    );
  }
});

test('retorna somente o contrato público e scores ordenados', () => {
  const results = search.search(fixtures[0].entrada);
  assert.deepEqual(Object.keys(results[0]), [
    'id', 'documento', 'artigo', 'idioma', 'fases', 'score', 'texto',
  ]);
  assert.ok(results.every((result, index) => index === 0 || results[index - 1].score >= result.score));
});

test('filtros preservam chunks bilíngues e a fase geral', () => {
  const english = search.search({
    texto: 'request taxi instructions', idioma: 'en', fase: 'solo', limite: 8,
  });
  assert.ok(english.some(({ id }) => id === 'MCA-100-16-art0125'));
  assert.ok(english.every(({ idioma }) => idioma.split('-').includes('en')));
  assert.ok(english.every(({ fases }) => fases.includes('solo') || fases.includes('geral')));
});

test('não inventa cobertura e valida a entrada', () => {
  const uncovered = fixtures.find(({ sem_cobertura }) => sem_cobertura);
  const results = search.search(uncovered.entrada);
  assert.equal(results.length, 6);
  assert.ok(results.every(({ score }) => score === 0));
  assert.throws(() => search.search({ texto: 'táxi', idioma: 'fr', fase: 'solo' }), /idioma/);
  assert.throws(() => search.search({ texto: 'táxi', idioma: 'pt', fase: 'cruzeiro' }), /fase/);
  assert.throws(() => search.search({ texto: 'táxi', idioma: 'pt', fase: 'solo', limite: 4 }), /limite/);
});

test('fase_de_voo filtra antes do ranking sem remover trechos gerais', () => {
  const results = search.search({
    texto: 'solicito autorização para táxi', idioma: 'pt', fase_de_voo: 'rota', limite: 8,
  });
  assert.ok(!results.some(({ id }) => id === 'MCA-100-16-art0125'));
  assert.ok(results.every(({ fases }) => fases.includes('rota') || fases.includes('geral')));
  assert.throws(() => search.search({
    texto: 'táxi', idioma: 'pt', fase: 'solo', fase_de_voo: 'rota',
  }), /não podem ser diferentes/);
});
