# ATC_COM_SIM
Simulador de comunicações com ATCO's

## Arquitetura

A aplicação é uma só: o simulador documental em `/` (`index.html` + `web/app.js`),
com entrada por texto/PTT, cenários, evidências e score. O endpoint
`/api/interpret-transmission` (interpretador semântico com grounding obrigatório) e
`/api/transcribe` (STT) são funções serverless Node.js na Vercel; as credenciais permanecem
exclusivamente no servidor. Em desenvolvimento, o plugin de `vite.config.js` expõe os mesmos
handlers. O interpretador principal usa apenas providers explicitamente gratuitos; o parser local
existe como fallback identificado. Nenhuma chamada Gemini integra o pipeline atual.

A prova de conceito React (`/voice.html` → `/api/generate-reply`) foi **descontinuada**: aquele
caminho não tinha RAG, estado de voo nem grounding, e a decisão arquitetural registrada em
`docs/REFATOR_DEEP.md` (§F7, opção A) manteve a interface fundamentada nos manuais como a única
do produto. O que a prova de conceito tinha de útil (indicação de idioma da sessão, aviso de
incompatibilidade com a Web Speech, tratamento do erro de microfone, canal de rádio dirigido pelo
fim do TTS) foi portado — a checklist está em `docs/INVENTARIO-APP-JSX.md`.

## Instalação e execução

Requer Node.js 24 (mesma versão principal usada no runtime da Vercel):

```bash
npm ci
npm run dev
```

O Vite informa a URL local (normalmente `http://localhost:5173`). A tela oferece
cenários, entrada por texto e PTT, evidência documental e score. Chrome ou Edge
recente, HTTPS (exceto em localhost) e permissão de microfone são necessários para
os fluxos de voz; quando a Web Speech API não está disponível a tela **avisa** e o
simulador continua plenamente utilizável por texto.

Comandos disponíveis:

```bash
npm test          # testes unitários e de integração
npm run test:dialogue       # matriz normativa de regressão de diálogo (sequências multi-turno)
npm run test:dialogue-baseline # detector de mudança da caracterização (não-normativo)
npm run test:stt  # fixture e cadeia STT gratuita
npm run test:llm  # OpenRouter real, somente modelos free
npm run benchmark:llm # precisão/schema/latência apenas de candidatos free
npm run validate  # consultas de referência e reprodutibilidade do índice
npm run build     # build de produção em dist/ (entrada única: o simulador)
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

Nomes lidos pelo código (nenhum valor, nada de segredo): política de custo
(`ZERO_COST_MODE`, `ALLOW_PAID_API`, `OPENROUTER_FREE_ONLY`, `GROQ_FREE_TIER_CONFIRMED`),
interpretador (`LLM_PROVIDER`, `LLM_TIMEOUT_MS`, `LLM_CANDIDATES`, `OPENROUTER_FREE_PRIMARY`,
`OPENROUTER_FREE_SECONDARY`, `OPENROUTER_FREE_TERTIARY`, `OPENROUTER_FREE_QUATERNARY`,
`OPENROUTER_FREE_ROUTER`, `GROQ_LLM_PRIMARY`, `GROQ_LLM_SECONDARY`, `GROQ_MODEL`), orçamento de
contexto (`LLM_CONTEXT_BUDGETS`, `LLM_CONTEXT_BUDGET_DEFAULT`, `LLM_CONTEXT_RESERVE_TOKENS`),
voz (`STT_GROQ_MODEL`, `STT_FIXES`) e chaves (`OPENROUTER_API_KEY`, `GROQ_API_KEY`). Os nomes
`AI_PROVIDER`, `AI_SDK_*`, `OPENAI_API_KEY` e `OPENAI_BASE_URL` deixaram de ser lidos com a
remoção do caminho sem grounding (F7) e podem ficar vazios no ambiente.

### Sem provider pago alcançável

O único caminho pago que existia — o opt-in do Vercel AI SDK
(`AI_PROVIDER=ai-sdk` + `ALLOW_PAID_API=true`) para a resposta do controlador no loop de voz sem
grounding — foi removido com a interface paralela (F7). Com isso, a política de custo não tem mais
nenhuma exceção: `server/cost-policy.js` só permite OpenRouter explicitamente `:free` (com
`pricing.prompt=0` e `pricing.completion=0` confirmados no catálogo público), Groq com tier
comprovado e os recursos locais/navegador. `ZERO_COST_MODE=true` e `ALLOW_PAID_API=false`
permanecem invariantes (ADR-002).

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
- Simulador documental: `/` (entrada de build única)

A proteção SSO da equipe permanece ativa nas URLs de preview; smoke tests de
preview precisam usar o bypass de automação da Vercel. A URL de produção é
pública e foi validada sem credenciais.

## Cotejamento e autorização pendente

A autorização que o controlador emite é guardada como **objeto estruturado**
(`contexto.autorizacao_pendente`), não como booleano: `obrigatorios` é o que o piloto precisa
repetir e `informativos` é o que ele apenas reporta. Os papéis vêm dos elementos tipados da
realização (`src/phraseology.js`), não de quantos números a frase tem:

- **QNH meramente informativo** (táxi, circuito, partida VFR) não é cobrado de volta — repetir a
  pista e omitir o QNH é cotejamento **correto**;
- **vento e dados meteorológicos** nunca são exigidos: não têm campo cotejável;
- repetir um informativo com valor errado continua sendo **divergência** (Art. 12, § 1º: o
  controlador responde "negativo" seguido da versão correta e a obrigação permanece pendente);
- cotejamento correto encerra a obrigação **sem** sobrescrever a autorização cotejada.

A tabela e o avaliador ficam em `src/readback-rules.js` (substitui os dois avaliadores divergentes
que existiam em `src/training.js`) e estão citados no Art. 12, III e Art. 45 do MCA 100-16.

## Regressão de diálogo (matriz normativa)

`reference/dialogue-regression-matrix.json` descreve sequências completas de voo, cada turno com a
fonte documental esperada, a fase/frequência resultantes e — quando o turno é uma repetição — a
classificação do cotejamento. Diferente dos testes de transmissão isolada, a execução evolui **um
único estado** turno a turno, como o navegador faz.

```bash
npm run test:dialogue            # valida a matriz e executa os roteiros
npm run validate:dialogue-matrix # só o schema/corpus/Art. 12, III
```

O validador `scripts/validate-dialogue-matrix.mjs` barra fonte inexistente no corpus, `intent`
desconhecido, campo obrigatório fora do Art. 12, III e fonte que não pertence à regra documental da
própria intenção. O `npm run audit` roda `test:dialogue` junto com a suíte.

## PTT, fonia e modelos

- **PTT**: apertar, segurar e soltar em qualquer lugar da tela encerra a captura (os eventos de
  soltura são escutados na `window` apenas enquanto existe operação ativa). O botão mostra o estado
  do **canal** — `LIVRE`, `TRANSMITINDO`, `RECEBENDO` (`src/ptt-state.js`) — e fica indisponível
  enquanto a frequência está ocupada pela resposta (half-duplex). Os estágios internos do pipeline
  continuam existindo só em `?debug=1`. O canal volta a `LIVRE` quando o áudio termina de tocar.
- **Fonia**: toda fala do controlador é falada, inclusive pedido de esclarecimento, recusa por base
  insuficiente e dado externo não integrado (`src/tts-policy.js`).
- **Sinal de informação faltante**: quando a interpretação declara materialmente ausente (ou
  duvidosa) uma informação que a variante **documentada** exige, a decisão pergunta em vez de
  autorizar com o valor presumido — o sinal do LLM é entrada da decisão, nunca a decisão, e não cria
  pergunta que a documentação não preveja (`src/knowledge.js`, `llmFlaggedFields` em `?debug=1`).
- **Modelos**: o seletor do painel de cenário prioriza um candidato gratuito (persistido em
  `localStorage` e enviado como `preferredModelId`); a prioridade **nunca desliga o fallback** — se o
  preferido falhar, a resposta segue pelo próximo modelo gratuito, e o indicador ao lado do botão de
  voz mostra qual modelo respondeu de fato (`↻ alternativa N` quando houve troca).
- **Orçamento de contexto** (`src/llm/context-budget.js`): o histórico é cortado conforme o orçamento
  do candidato **que está prestes a ser tentado**, preservando indicativo, aeródromo, fase,
  frequência, pista, última autorização, autorização/pergunta pendente e situação de emergência.
  Nada é presumido por fornecedor: a janela vem do `context_length` do **catálogo público** que a
  validação gratuita já consulta, menos a reserva de resposta (`RESPONSE_RESERVE_TOKENS`); quando o
  metadado não existe, o orçamento cai no teto conservador (8.000 tokens de entrada) — nunca no
  maior valor conhecido — e registra a origem (`catalog`, `configured` ou `default`) no diagnóstico
  de `?debug=1`. Uma janela pequena corta o histórico antigo em vez de recusar o candidato; se nem
  o contexto operacional couber, o candidato é pulado **sem** chamada de rede com o código
  `llm_context_budget_exceeded` (nunca como "documento ausente"). `LLM_CONTEXT_BUDGETS` (JSON) e
  `LLM_CONTEXT_BUDGET_DEFAULT` continuam existindo como sobreposição explícita do operador.

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

Veja [ADR-002](docs/ADR-002-ZERO-COST.md), a
[decisão LLM-first original](docs/ADR-001-LLM-FIRST.md) e a
[ADR-003](docs/ADR-003-DIALOGO-E-EVIDENCIA.md), que registra por que a evidência é descoberta por
predicado documental e por que o diálogo passou a ser estado da sessão.

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
