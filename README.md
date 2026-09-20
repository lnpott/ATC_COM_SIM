# ATC_COM_SIM
Simulador de comunicações com ATCO's

## Arquitetura

O frontend, construído com Vite, preserva duas experiências complementares: o
simulador documental em `/`, com entrada por texto/PTT, cenários, evidências e
score; e a prova de conceito React de voz em `/voice.html`. O endpoint
`/api/interpret-transmission` e `/api/generate-reply` são funções serverless Node.js na Vercel; as credenciais permanecem exclusivamente no servidor. Em desenvolvimento, o plugin de `vite.config.js` expõe os mesmos handlers. O interpretador principal usa Gemini no servidor; o parser local existe somente como fallback identificado.

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

Configure **somente no servidor** (nunca use o prefixo `VITE_`):

| Provedor | Variáveis |
| --- | --- |
| Gemini (padrão) | `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.8-flash` |
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

As variáveis devem ser cadastradas separadamente nos ambientes Preview e Production. O arquivo `.env.example` documenta apenas nomes e nunca deve
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

## Arquitetura de compreensão

Uma sessão PTT consolida o STT antes de qualquer chamada. O browser envia texto
bruto, normalização superficial, cenário e contexto confirmado limitado para
`POST /api/interpret-transmission`. O backend usa `@google/genai`, structured
output JSON Schema e `gemini-3.8-flash` com thinking desabilitado, temperatura
0,1, timeout de oito segundos e retry curto somente para 5xx.

O resultado validado gera queries a partir de intenção, família, fase,
`searchConcepts` e entidades. BM25, aliases, prior de metadados somente sobre
resultados efetivamente encontrados, reranking e chunks vizinhos preservam IDs
reais. O controlador determinístico exige evidência antes de autorizar e a
máquina de estados valida a proposta. A LLM nunca autoriza nem altera estado.

```text
PTT → STT final → Gemini/schema → contexto → queries → BM25/reranking/vizinhos
→ grounding → decisão → estado validado → resposta → TTS/evidências/debug
```

### Fallback

Timeout, quota, 4xx/5xx, resposta vazia, JSON ou schema inválido não são tratados
como “sem cobertura documental”. O cliente executa o interpretador determinístico
existente e registra `interpretationMode=deterministic_fallback`; grounding e
estado continuam obrigatórios. O fallback tem capacidade inferior e não é
apresentado como equivalente ao modo LLM.

### Debug e latência

Use `/?debug=1` para habilitar `window.__ATC_DEBUG__`. Cada registro inclui IDs de
sessão/PTT, transcrições, modo/provider/modelo, latência LLM, estrutura semântica,
contexto limitado, queries, BM25/reranking/vizinhos, evidências, decisão, resposta,
estado e locale TTS. Chaves, tokens e segredos nunca são incluídos. Veja a
[decisão arquitetural](docs/ADR-001-LLM-FIRST.md).

### Testes e limitações de voz

`npm run test:llm` executa a suíte opt-in real quando `GEMINI_API_KEY` existe;
`npm test` usa provider controlado e não consome quota. O teste automatizado de
Web Speech usa implementação controlada. Checklist humano: Chrome/Edge atual,
HTTPS, microfone permitido; pressionar PTT, falar a frase longa, soltar e confirmar
uma transcrição, uma interpretação e uma resposta. STT e TTS ainda dependem do
browser, sistema operacional, microfone e vozes instaladas.

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
