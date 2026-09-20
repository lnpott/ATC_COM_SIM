# ATC_COM_SIM
Simulador de comunicações com ATCO's

## Arquitetura

O frontend, construído com Vite, preserva duas experiências complementares: o
simulador documental em `/`, com entrada por texto/PTT, cenários, evidências e
score; e a prova de conceito React de voz em `/voice.html`. O endpoint
`/api/interpret-transmission` e `/api/generate-reply` são funções serverless Node.js na Vercel; as credenciais permanecem exclusivamente no servidor. Em desenvolvimento, o plugin de `vite.config.js` expõe os mesmos handlers. O interpretador principal usa apenas providers explicitamente gratuitos; o parser local existe como fallback identificado. Nenhuma chamada Gemini integra o pipeline atual.

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
npm run test:stt  # fixture e cadeia STT gratuita
npm run test:llm  # OpenRouter real, somente modelos free
npm run benchmark:llm # precisão/schema/latência apenas de candidatos free
npm run validate  # consultas de referência e reprodutibilidade do índice
npm run build     # build de produção em dist/
npm run audit     # todos os comandos acima
npm start         # serve dist/ após um build
```

## Variáveis de ambiente e custo zero

`ZERO_COST_MODE=true` e `ALLOW_PAID_API=false` são invariantes desta fase. Toda
chamada externa atravessa `server/cost-policy.js` antes da rede. OpenRouter só é
permitido para IDs `:free` ou `openrouter/free` e ainda exige validação ao vivo de
`pricing.prompt=0` e `pricing.completion=0`. Saldo na conta não é autorização para
uso. Groq fica desabilitado enquanto `GROQ_FREE_TIER_CONFIRMED=false`; a existência
de chave não comprova o tier.

A configuração completa, sem valores secretos, está em `.env.example`. A ordem LLM
é Groq fixo somente se o Free tier for confirmado, OpenRouter fixo `:free` primário,
fixos `:free` subsequentes, `openrouter/free` e parser determinístico. Gemini não é
usado. TTS permanece `SpeechSynthesis` do browser.

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

No fluxo de voz, `pointerdown` cria um ID e inicia MediaRecorder e o Web Speech de
apoio. `pointerup` finaliza uma única gravação. O STT tenta Groq Whisper somente com
Free tier confirmado, ASR local Whisper Tiny em Web Worker (WebGPU, depois WASM) e
Web Speech como último fallback. Nenhum resultado parcial aciona o controlador.

A transcrição final vai a `POST /api/interpret-transmission`. O resolver LLM valida
o catálogo público atual antes de cada janela de cache e tenta os modelos fixos
OpenRouter gratuitos antes de `openrouter/free`. Structured output passa pelo JSON
Schema e pela validação local. O parser determinístico é o último fallback.

```text
PTT → MediaRecorder → Groq confirmado? → ASR local → Web Speech
→ OpenRouter fixed :free → fixed :free → openrouter/free → parser local
→ estado → queries → BM25/reranking/vizinhos → grounding → decisão
→ estado validado → SpeechSynthesis/evidências/debug
```

O resultado semântico gera queries a partir de intenção, família, fase,
`searchConcepts` e entidades. BM25, aliases, prior apenas sobre resultados
realmente recuperados, reranking e chunks vizinhos preservam IDs reais. A LLM
nunca autoriza, seleciona documento ou altera estado.

### Fallback e erros

Quota/429 não é repetida em avalanche: o resolver avança para o próximo candidato
gratuito. O timeout por candidato é limitado a 15 segundos; schema, provider e STT têm códigos distintos. Se todos falharem,
o pipeline determinístico continua com grounding e estado obrigatórios; isso não é
reportado como “documento ausente”.

### Debug e latência

`/?debug=1` registra política de custo, sessão/PTT, MIME/tamanho/duração, provider,
modelo solicitado/real, validação free, profundidade de fallback, tokens sem
conteúdo, latências STT/LLM/retrieval/decisão/total, estrutura semântica, queries,
rankings, evidências, decisão, estado e TTS. Nunca registra segredo.

### Testes e limitações de voz

`npm run test:llm` usa somente OpenRouter explicitamente free; Groq é skip enquanto
o tier não puder ser comprovado. `npm run test:stt` usa a fixture WAV versionada e
implementações controladas sem custo. Checklist humano: Chrome/Edge, HTTPS,
permissão de microfone; pressionar PTT, falar a frase longa, soltar e confirmar uma
gravacão, transcrição, interpretação e resposta. Microfone físico e qualidade das
vozes continuam dependentes do dispositivo.

Veja [ADR-002](docs/ADR-002-ZERO-COST.md) e a
[decisão LLM-first original](docs/ADR-001-LLM-FIRST.md).

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
