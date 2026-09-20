# ATC_COM_SIM
Simulador de comunicações com ATCO's

## Arquitetura

O frontend, construído com Vite, preserva duas experiências complementares: o
simulador documental em `/`, com entrada por texto/PTT, cenários, evidências e
score; e a prova de conceito React de voz em `/voice.html`. O endpoint
`/api/generate-reply` é uma função serverless Node.js na Vercel; as credenciais
de provedores permanecem exclusivamente no servidor. Em desenvolvimento, o
plugin de `vite.config.js` expõe o mesmo handler. O provedor padrão é o `mock`,
que permite executar integralmente a demonstração sem credenciais externas.

## Instalação e execução

Requer Node.js 24 (mesma versão principal usada no runtime da Vercel):

```bash
npm ci
npm run dev
```

O Vite informa a URL local (normalmente `http://localhost:5173`). A tela oferece
cenários, entrada por texto e PTT, evidência documental e score. A rota
`/voice.html` oferece o loop PT/EN conectado ao endpoint server-side. Chrome ou
Edge recente, HTTPS (exceto em localhost) e permissão de microfone são
necessários para os fluxos de voz; o simulador principal continua utilizável
por texto quando a Web Speech API não está disponível.

Comandos disponíveis:

```bash
npm test          # testes unitários e de integração
npm run validate  # consultas de referência e reprodutibilidade do índice
npm run build     # build de produção em dist/
npm run audit     # todos os comandos acima
npm start         # serve dist/ após um build
```

## Variáveis de ambiente

Nenhuma variável é obrigatória: sem configuração, `LLM_PROVIDER=mock` é usado.
Para habilitar um provedor remoto, configure **somente no servidor** uma das
combinações abaixo (nunca use o prefixo `VITE_`):

| Provedor | Variáveis |
| --- | --- |
| Mock | `LLM_PROVIDER=mock` (opcional) |
| Gemini | `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Groq | `LLM_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL` |

## Implantação na Vercel

O `vercel.json` fixa o preset Vite, `npm run build` e o diretório `dist`. A pasta
raiz do projeto Vercel deve ser a raiz deste repositório. Depois de autenticar a
CLI, uma implantação reproduzível pode ser feita com:

```bash
vercel link
vercel deploy       # preview
vercel deploy --prod
```

As variáveis de um provedor remoto devem ser cadastradas separadamente nos
ambientes Preview e Production. O modo `mock` é indicado para smoke tests e não
exige segredo. O arquivo `.env.example` documenta apenas nomes e nunca deve
conter chaves reais.

Implantação mantida por este repositório:

- Projeto: `lnpotts-projects/atc-com-sim`
- Produção: <https://atc-com-sim.vercel.app>
- Simulador documental: `/`
- Laboratório React de voz: `/voice.html`

A proteção SSO da equipe permanece ativa nas URLs de preview; smoke tests de
preview precisam usar o bypass de automação da Vercel. A URL de produção é
pública e foi validada sem credenciais.

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
`reference/search-queries.v1.json`. Os IDs têm o formato normalizado
`DOCUMENTO-artigo-NNNN-SEGMENTO`.

## Compreensão contextual e diagnóstico

O simulador principal não consulta mais o BM25 somente com a frase completa. O
pipeline separa normalização, interpretação de intenção/entidades, contexto da
sessão, formulação de consultas, recuperação híbrida, expansão lógica,
reranking, grounding, decisão e atualização validada de estado. A estratégia é
local e determinística; não requer LLM ou embeddings para os casos atualmente
suportados.

Use `/?debug=1` para habilitar o diagnóstico opt-in em
`window.__ATC_DEBUG__`. Cada registro mostra a intenção, entidades, consultas,
rankings, evidências, motivo da decisão e transição, sem incluir variáveis de
ambiente. A análise da causa raiz, métricas antes/depois, auditoria do corpus e
limitações estão em [`docs/PIPELINE_CONTEXTUAL.md`](docs/PIPELINE_CONTEXTUAL.md).

## Motor e módulos de treino

As etapas posteriores permanecem separadas por módulos determinísticos: normalização
de fonia (`src/normalization.js`), estado do voo (`src/state-machine.js`), grounding
obrigatório (`src/grounding.js`), cenários (`src/scenarios.js`), avaliação e relatório
(`src/training.js`) e áudio/fila de transmissões (`src/radio.js`). `SimulatorSession`
coordena essas fronteiras sem escolher um provedor de LLM. Os adaptadores gratuitos
de STT/TTS do navegador ficam em `src/speech.js` e falham explicitamente quando a
Web Speech API não está disponível.

Use `npm run audit` para executar testes, validação das consultas, auditoria do
corpus, confirmação de que o índice é reproduzível e build. Use `npm run
build:index` somente quando o corpus versionado mudar.
