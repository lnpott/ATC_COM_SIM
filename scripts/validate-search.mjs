import { readFile } from 'node:fs/promises';
import { ManualSearch } from '../src/search.js';

const referenceUrl = new URL('../reference/search-queries.v1.json', import.meta.url);
const reference = JSON.parse(await readFile(referenceUrl, 'utf8'));
const sourceChunks = JSON.parse(await readFile(
  new URL('../atc-simulator-chunks.json', import.meta.url), 'utf8',
));
if (reference.versao !== 1 || !Array.isArray(reference.consultas)) {
  throw new Error('Formato inválido do conjunto de consultas de referência.');
}

const search = await ManualSearch.load();
const knownIds = new Set(search.index.chunks.map(({ id }) => id));
if (knownIds.size !== search.index.chunks.length) throw new Error('IDs duplicados no índice.');
assertSameIds(sourceChunks, search.index.chunks);

for (const fixture of reference.consultas) {
  for (const id of fixture.ids_esperados ?? []) {
    if (!knownIds.has(id)) throw new Error(`${fixture.nome}: ID esperado inexistente: ${id}`);
  }
  const results = search.search(fixture.entrada);
  if (results.length < 5 || results.length > 8) {
    throw new Error(`${fixture.nome}: busca retornou ${results.length} resultados.`);
  }
  if (fixture.sem_cobertura) {
    if (results.some(({ score }) => score !== 0)) {
      throw new Error(`${fixture.nome}: cobertura documental inesperada.`);
    }
    continue;
  }
  const resultIds = new Set(results.map(({ id }) => id));
  const resultArticles = new Set(results.map(({ artigo }) => artigo));
  for (const id of fixture.ids_esperados ?? []) {
    if (!resultIds.has(id)) throw new Error(`${fixture.nome}: não recuperou ${id}.`);
  }
  for (const article of fixture.artigos_esperados ?? []) {
    if (!resultArticles.has(article)) throw new Error(`${fixture.nome}: não recuperou ${article}.`);
  }
}

console.log(`Índice e ${reference.consultas.length} consultas de referência validados.`);

function assertSameIds(source, indexed) {
  if (source.length !== indexed.length) throw new Error('Corpus e índice têm tamanhos diferentes.');
  source.forEach((chunk, position) => {
    if (chunk.id !== indexed[position].id) {
      throw new Error(`ID divergente entre corpus e índice na posição ${position}.`);
    }
  });
}
