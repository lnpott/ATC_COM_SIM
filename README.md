# ATC_COM_SIM
Simulador de comunicações com ATCO's

## Executar

Requer Node.js 20 ou superior e não instala dependências externas:

```bash
npm start
```

Abra `http://127.0.0.1:4173`. A tela oferece cenários PT/EN, entrada por texto,
PTT quando a Web Speech API estiver disponível, resposta falada, fontes recuperadas
e score da sessão. O controlador local é determinístico e somente emite uma
autorização quando o artigo específico da intenção foi recuperado.

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

## Motor e módulos de treino

As etapas posteriores permanecem separadas por módulos determinísticos: normalização
de fonia (`src/normalization.js`), estado do voo (`src/state-machine.js`), grounding
obrigatório (`src/grounding.js`), cenários (`src/scenarios.js`), avaliação e relatório
(`src/training.js`) e áudio/fila de transmissões (`src/radio.js`). `SimulatorSession`
coordena essas fronteiras sem escolher um provedor de LLM. Os adaptadores gratuitos
de STT/TTS do navegador ficam em `src/speech.js` e falham explicitamente quando a
Web Speech API não está disponível.

Use `npm run audit` para executar testes, validação das consultas e confirmação de
que o índice pode ser reproduzido a partir do corpus. Use `npm run build:index`
somente quando o corpus versionado mudar.
