# ATC_COM_SIM
Simulador de comunicações com ATCO's

## Busca documental

O módulo `ManualSearch` é uma fronteira independente da interface e da geração de
autorizações. Ele carrega o índice BM25 versionado e recebe `texto`, `idioma` e
`fase_de_voo`; por padrão devolve seis resultados (configurável entre cinco e oito).
Uma consulta sem cobertura também mantém essa quantidade, mas todos os resultados
têm `score` igual a zero, permitindo que a próxima camada recuse a resposta.

```js
import { ManualSearch } from './src/search.js';

const search = await ManualSearch.load();
const trechos = search.search({
  texto: 'solicito autorização para táxi',
  idioma: 'pt',
  fase_de_voo: 'solo',
});
```

Cada trecho contém somente `id`, `documento`, `artigo`, `idioma`, `fases`,
`score` e `texto`. Execute `npm test` para os testes unitários e `npm run
validate` para conferir estaticamente o índice e as consultas em
`reference/search-queries.v1.json`.
