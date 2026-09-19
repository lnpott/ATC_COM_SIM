import { readFile } from 'node:fs/promises';

const LANGUAGES = new Set(['pt', 'en']);
const PHASES = new Set([
  'geral', 'solo', 'decolagem', 'rota', 'aproximacao', 'pouso', 'emergencia',
]);

/** Tokenization used when the checked-in BM25 index was generated. */
export function tokenize(text) {
  return text.toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function assertIndex(index) {
  if (!index || !Array.isArray(index.chunks) || !Array.isArray(index.corpus)) {
    throw new TypeError('Índice inválido: chunks e corpus devem ser listas.');
  }
  if (index.chunks.length !== index.corpus.length || index.chunks.length === 0) {
    throw new TypeError('Índice inválido: chunks e corpus devem ter o mesmo tamanho não vazio.');
  }
  if (!index.idf || !Number.isFinite(index.metadados?.avgdl)) {
    throw new TypeError('Índice inválido: estatísticas BM25 ausentes.');
  }
  const ids = index.chunks.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('Índice inválido: IDs de chunks duplicados.');
  }
  if (!index.corpus.every(Array.isArray)) {
    throw new TypeError('Índice inválido: cada entrada do corpus deve ser uma lista de termos.');
  }
}

/**
 * Search boundary for the simulator. It deliberately has no dependency on the UI
 * or on the authorization-generation layer.
 */
export class ManualSearch {
  constructor(index) {
    assertIndex(index);
    this.index = index;
  }

  static async load(indexPath = new URL('../atc-simulator-index.json', import.meta.url)) {
    const url = indexPath instanceof URL ? indexPath : new URL(indexPath, import.meta.url);
    let contents;
    if (url.protocol === 'file:') {
      const { readFile } = await import('node:fs/promises');
      contents = await readFile(url, 'utf8');
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Falha ao carregar índice: HTTP ${response.status}.`);
      contents = await response.text();
    }
    const contents = await readFile(indexPath, 'utf8');
    return new ManualSearch(JSON.parse(contents));
  }

  /**
   * `fase_de_voo` is the public name; `fase` remains accepted for compatibility
   * with the first version of the reference fixture.
   * @param {{texto: string, idioma: 'pt'|'en', fase_de_voo?: string, fase?: string, limite?: number}} input
   * @returns {Array<{id: string, documento: string, artigo: string, idioma: string, fases: string[], score: number, texto: string}>}
   */
  search({ texto, idioma, fase_de_voo: flightPhase, fase, limite = 6 } = {}) {
    if (typeof texto !== 'string' || texto.trim() === '') {
      throw new TypeError('texto deve ser uma string não vazia.');
    }
    if (!LANGUAGES.has(idioma)) {
      throw new RangeError('idioma deve ser "pt" ou "en".');
    }
    if (flightPhase && fase && flightPhase !== fase) {
      throw new RangeError('fase e fase_de_voo não podem ser diferentes.');
    }
    const selectedPhase = flightPhase ?? fase;
    if (!PHASES.has(selectedPhase)) {
      throw new RangeError(`fase_de_voo inválida: ${selectedPhase}.`);
    }
    if (!Number.isInteger(limite) || limite < 5 || limite > 8) {
      throw new RangeError('limite deve ser um inteiro entre 5 e 8.');
    }

    const queryTerms = [...new Set(tokenize(texto))];
    const { chunks, corpus, idf, metadados } = this.index;
    const averageLength = metadados.avgdl;
    const results = [];

    for (let position = 0; position < chunks.length; position += 1) {
      const chunk = chunks[position];
      const chunkLanguages = chunk.idioma.split('-');
      const phaseMatches = chunk.fases.includes(selectedPhase) || chunk.fases.includes('geral');
      if (!chunkLanguages.includes(idioma) || !phaseMatches) continue;

      const terms = corpus[position];
      const frequencies = new Map();
      for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);

      let score = 0;
      for (const term of queryTerms) {
        const frequency = frequencies.get(term) ?? 0;
        if (!frequency || !idf[term]) continue;
        const denominator = frequency + 1.2 * (0.25 + 0.75 * terms.length / averageLength);
        score += idf[term] * (frequency * 2.2) / denominator;
      }
      results.push({
        id: chunk.id,
        documento: chunk.doc,
        artigo: chunk.artigo,
        idioma: chunk.idioma,
        fases: [...chunk.fases],
        score: Number(score.toFixed(6)),
        texto: chunk.texto,
      });
    }

    return results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limite);
  }
}
