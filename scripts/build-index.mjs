import { readFile, writeFile } from 'node:fs/promises';
import { tokenize } from '../src/search.js';

const chunksPath = new URL('../atc-simulator-chunks.json', import.meta.url);
const indexPath = new URL('../atc-simulator-index.json', import.meta.url);
const chunks = JSON.parse(await readFile(chunksPath, 'utf8'));

const ids = chunks.map(({ id }) => id);
if (new Set(ids).size !== ids.length) throw new Error('Não é possível indexar IDs duplicados.');

const corpus = chunks.map((chunk) => tokenize([
  chunk.artigo.replace(/\d+/g, ''), chunk.tipo, ...chunk.fases, chunk.texto,
].join(' ')).filter((term) => !/^\d+$/.test(term)));
const documentFrequency = new Map();
for (const terms of corpus) {
  for (const term of new Set(terms)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
}
const idf = Object.fromEntries([...documentFrequency].map(([term, frequency]) => [
  term, Math.log((chunks.length - frequency + 0.5) / (frequency + 0.5) + 1),
]));
const previous = JSON.parse(await readFile(indexPath, 'utf8'));
const index = {
  metadados: {
    n_chunks: chunks.length,
    avgdl: Number((corpus.reduce((sum, terms) => sum + terms.length, 0) / chunks.length).toFixed(2)),
    docs: previous.metadados.docs,
  },
  idf,
  corpus,
  chunks,
};

if (process.argv.includes('--check')) {
  const current = JSON.parse(await readFile(indexPath, 'utf8'));
  if (JSON.stringify(current) !== JSON.stringify(index)) {
    throw new Error('Índice desatualizado; execute npm run build:index.');
  }
  console.log(`Índice reproduzível validado (${chunks.length} chunks).`);
} else {
  await writeFile(indexPath, `${JSON.stringify(index)}\n`);
  console.log(`Índice gerado (${chunks.length} chunks).`);
}
