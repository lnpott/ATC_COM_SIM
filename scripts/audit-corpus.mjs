import { readFile } from 'node:fs/promises'

const chunks = JSON.parse(await readFile(new URL('../atc-simulator-chunks.json', import.meta.url), 'utf8'))
const index = JSON.parse(await readFile(new URL('../atc-simulator-index.json', import.meta.url), 'utf8'))
const required = ['id', 'documento', 'titulo', 'versao', 'artigo', 'tipo', 'idioma', 'fases', 'texto', 'posicao_original']
const duplicateIds = chunks.length - new Set(chunks.map(({ id }) => id)).size
const duplicateTexts = chunks.length - new Set(chunks.map(({ texto }) => texto)).size
const missing = Object.fromEntries(required.map((field) => [field, chunks.filter((chunk) => chunk[field] === undefined || chunk[field] === '').length]))
const lengths = chunks.map(({ texto }) => texto.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b)
const brokenOrder = chunks.filter((chunk, position) => position > 0 && chunk.posicao_original <= chunks[position - 1].posicao_original).length
const sourceIds = new Set(chunks.map(({ id }) => id))
const indexIds = new Set(index.chunks.map(({ id }) => id))
const mismatch = [...new Set([...sourceIds, ...indexIds])].filter((id) => !sourceIds.has(id) || !indexIds.has(id))

if (duplicateIds || mismatch.length || index.metadados.n_chunks !== chunks.length) throw new Error('Corpus e índice não são estruturalmente consistentes.')
if (Object.values(missing).some(Boolean)) throw new Error(`Campos obrigatórios ausentes: ${JSON.stringify(missing)}`)

console.log(JSON.stringify({
  chunks: chunks.length,
  indexedChunks: index.chunks.length,
  documents: Object.fromEntries([...new Set(chunks.map(({ documento }) => documento))].map((documento) => [documento, chunks.filter((chunk) => chunk.documento === documento).length])),
  titles: [...new Set(chunks.map(({ titulo }) => titulo))],
  duplicateIds,
  duplicateTexts,
  brokenOrder,
  missing,
  pagesPresent: chunks.filter((chunk) => chunk.pagina !== undefined).length,
  sectionsPresent: chunks.filter((chunk) => chunk.secao).length,
  lengthWords: { min: lengths[0], median: lengths[Math.floor(lengths.length / 2)], max: lengths.at(-1), under20: lengths.filter((length) => length < 20).length, over500: lengths.filter((length) => length > 500).length },
  relevantTaxiArticle: chunks.find(({ id }) => id === 'MCA-100-16-artigo-0125-001')?.texto.includes('Instruções de táxi') ?? false,
}, null, 2))
