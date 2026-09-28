# Roadmap de execução da refatoração — ATC_COM_SIM

Documento de **acompanhamento**. Ele não substitui o plano: `docs/REFATOR_DEEP.md` define *o que* deve
ser feito, *por quê* e *como* em cada fase; este arquivo registra *onde estamos agora* — o que já foi
executado, com qual evidência, o que está em andamento e qual é o próximo passo.

- Última atualização: 27/09/2026 (execuções 4–9: fechamento de F1/F6, A3.17, unificação da interface — F7 —, auditoria final — F8 —, revisão pós-merge do PR #7, correção de C1/A1 e fechamento dos achados M1/M2/B1–B5)
- Plano de referência: `docs/REFATOR_DEEP.md`
- Briefing de origem: `docs/PLANO_REF.md`

## Como manter este documento

Ao concluir (ou iniciar) uma fase: atualizar a tabela de status, acrescentar uma entrada no registro
de execução com commit e verificação, e atualizar o status das divergências afetadas. Uma fase só
muda para **concluída** quando todos os critérios objetivos do plano forem atendidos e verificados
por comando reproduzível.

## Status das fases

| Fase | Escopo | Status | Evidência principal |
|---|---|---|---|
| F0 | Auditoria, inventário e linha de base (não-normativa) | **Concluída** | commit `a384a84`; 7 roteiros / 41 turnos; `npm run audit` verde; `docs/INVENTARIO-APP-JSX.md` |
| F1 | Conhecimento, interpretação contextual, diálogo e decisão | **Concluída** | `docs/ADR-003-DIALOGO-E-EVIDENCIA.md`; variantes documentadas em `src/knowledge/evidence-rules.js`; sinal do LLM consumido (`flaggedFields`); zero mapa `intent → artigo fixo` em `src/` |
| F2 | Estado operacional, autorização pendente e cotejamento | **Concluída** | `src/readback-rules.js` (autorização pendente estruturada + avaliador único); 110/110 testes |
| F3 | Matriz normativa de regressão de diálogo | **Concluída** | `reference/dialogue-regression-matrix.json` (8 roteiros/45 turnos), `scripts/validate-dialogue-matrix.mjs`, `npm run test:dialogue` |
| F4 | PTT e estados de rádio | **Concluída** | `src/ptt-state.js` (Livre/Transmitindo/Recebendo), fim de captura na `window`, botão bloqueado em `recebendo` |
| F5 | Modelos gratuitos: preferência, visibilidade e continuidade | **Concluída** | `preferredModelId` reordena sem desligar o fallback, indicador visível, teste de continuidade de contexto |
| F6 | Gestão de contexto e janela de tokens | **Concluída** | Orçamento da janela real do catálogo (`context_length` − reserva), sem corte fixo de mensagens/chars, `context_budget_exceeded` sem chamada de rede e origem do número no diagnóstico |
| F7 | Unificação da interface e descontinuação da paralela | **Concluída** | `voice.html`, `src/App.jsx`/`main.jsx`/`styles.css`, `/api/generate-reply`, `server/providers.js`, `server/ai-sdk-provider.js`, `public/radio-mark.svg` e as dependências React/AI SDK removidos; entrada de build única e itens 1/3/9 do inventário portados. A ressalva da execução 7 (fonia não fiada) foi corrigida na execução 8 e passou a ser afirmada por teste (`test/app-wiring.test.js`) |
| F8 | Auditoria final e validação integrada | **Concluída**, com a conferência humana declarada | `npm run audit` verde depois de F5/F6/F7 (105 testes + 9 da matriz + índice reproduzível + corpus + build de entrada única); nenhum provider pago ou sem grounding alcançável; A3.1–A3.17 com estado final registrado; documentação consolidada; limitações visíveis no README |

Legenda: **Concluída** · **Concluída, com ressalva** (critério do plano não verificado na execução, com motivo e evidência na entrada do registro) · **Em andamento** · **Pendente** · **Bloqueada** (com motivo registrado).

## Registro de execução

### 1. F0 — auditoria, inventário e linha de base `a384a84`

**Entregue**

- `reference/dialogue-inventory.v1.json` — 7 roteiros multi-turno cobrindo os 4 cenários de
  `src/scenarios.js` (ciclo feliz PT e EN, emergência com fogo, informação faltante e fora de
  contexto, frequência, ausência de cobertura e dado externo, emergência em rota).
- `scripts/update-dialogue-baseline.mjs` — harness que executa o **mesmo pipeline do navegador**
  (`normalizePhraseology → processTransmission → applyStateUpdate → recordTransmission`) e grava
  `reference/dialogue-baseline.v1.json`; possui modo `--check`.
- `test/dialogue-baseline.test.js` — detector de mudança **não-normativo** (4 testes).
- `docs/INVENTARIO-APP-JSX.md` — 11 itens da implementação paralela com decisão escrita
  (portar / substituir / descartar / decidir no F7), exigida pelo critério de conclusão do F7.
- `package.json` — `update:dialogue-baseline` e `test:dialogue-baseline`.

**Verificação**

- `npm run audit` completo verde (59 testes, índice reproduzível com 374 chunks, `vite build`).
- Determinismo: duas execuções produzem o mesmo arquivo (`--check` estável).
- Detector **não é vazio**: com a baseline perturbada de propósito, o teste falhou apontando
  `roteiros.0.turnos.4.fase: esperado "rota", obtido "aproximacao"`; a baseline foi restaurada e
  confirmada estável em seguida.

**Divergências novas reveladas pelo harness** (não conhecidas na análise inicial): A3.14, A3.15,
A3.16 e A3.17.

### 2. A3.14 — cobertura documental do cotejamento em inglês `145f7c7`

Executada como **fatia do F1** logo após o F0, por não depender do restante da fase. Detalhamento
completo em `docs/REFATOR_DEEP.md` §A.3.1. Resumo:

- **Investigação (§7):** o texto normativo do manual não tem coluna em inglês (arts. 1–20: 19/19
  `pt`); das 9 fontes normativas mapeadas por intenção, **8 são `pt-en`** e a única exclusivamente
  `pt` é o **art. 12 (cotejamento)** — o art. 45, provisão redundante, também é `pt`. Nenhum chunk
  enuncia a obrigação em inglês (busca por *shall/must be read back*: 0 resultados). Traduzir o
  artigo por conta própria criaria texto normativo inexistente — descartado.
- **O ato está documentado em inglês por dois outros caminhos:** `MCA-100-16-artigo-0039-001`
  (glossário `pt-en`, "COTEJE / READ BACK") e `MCA-100-16-artigo-0138-001` (`pt-en`,
  "cotejamento correto / your read back is correct").
- **Correção:** recuperação ciente de idioma em `src/retrieval.js`, com passagem pela língua
  original, aceita apenas se o BM25 realmente recuperou a fonte (sem injeção por ID), acionada
  somente quando a causa é de língua — e não de ranking —, preservando a ausência honesta.

**Verificação:** `test/readback-language-coverage.test.js` (6 casos) · 65/65 testes · `npm run audit`
verde · 42 diferenças na caracterização do F0, **todas** no roteiro `en_vfr_local_ciclo_completo`
(zero em PT e nos demais), classificadas como pretendidas e baseline regenerada deliberadamente ·
`unsupported` 3 → 1.

### 3. F2/F3/F4/F5 + fatias de F6/F7 — cinco problemas reportados

Executado a partir de `docs/PLANO-CORRECOES-2026-09.md` (os cinco itens) e do roteiro deste
roadmap. A divergência de duas interfaces (Decisão 0 do plano) **não** foi resolvida nesta entrega:
todos os itens foram implementados no pipeline documental (`web/app.js` + `src/`), que é o único
fundamentado nos manuais, e a unificação segue como F7.

**Entregue**

- **F2 — autorização pendente e cotejamento (item 3):** `src/readback-rules.js` cria a autorização
  pendente estruturada (`obrigatorios`/`informativos` derivados dos elementos tipados de
  `phraseology.js`) e o avaliador único `evaluateReadbackAgainstPending`. `autorizacao_pendente`
  passa a ser campo de contexto válido em `state-machine.js` e é populada em `controller.js`.
  QNH meramente informativo deixou de ser exigido de volta; vento nunca é exigido. O cotejamento
  correto também deixou de sobrescrever `ultima_autorizacao` com a própria confirmação.
  `web/app.js` consome `decision.readbackAssessment` — não existe mais segundo avaliador no
  navegador.
- **F3 — matriz normativa (item 2):** `reference/dialogue-regression-matrix.json` (8 roteiros, 45
  turnos, sequências em PT e EN, cotejamento correto/incompleto/divergente, emergência em rota,
  esclarecimento com recuperação, troca de frequência e reportagem de posição),
  `scripts/validate-dialogue-matrix.mjs` e `test/dialogue-regression.test.js`. Novos scripts
  `npm run test:dialogue` e `npm run validate:dialogue-matrix`; `test:dialogue` entra no
  `npm run audit`.
- **F4 — PTT (item 4):** `src/ptt-state.js` com os três estados de canal; soltura capturada na
  `window` durante a operação ativa; botão `disabled` em `recebendo`; canal só volta a `livre` no
  `onEnd`/`onError` da fonia. Atalho de teclado preservado.
- **F7 (fatia) — fonia (item 1):** `src/tts-policy.js` + `speakReply` em `web/app.js`: pedido de
  esclarecimento e recusa agora tocam áudio, não só texto.
- **F5/F6 (itens 5 e 6):** `preferredModelId` reordena os candidatos em `auto-free-provider.js`
  mantendo o fallback; `GET /api/models` não foi necessário (a lista é pública em
  `server/model-registry.js` e é importada pelo navegador); indicador de modelo visível com marca de
  troca automática; `src/llm/context-budget.js` corta o histórico por candidato e pula sem rede com
  `context_budget_exceeded`.
- **Reconhecimento de intenção:** `position_report`, `unable` e `go_around` passaram a ser
  reconhecidos pelo léxico determinístico (antes caíam em `unknown`/`ambiguous`), com precedência
  documentada para marcadores explícitos. Corrigiu três testes que falhavam em `coverage-taxonomy`.
- **Taxonomia:** `reason` voltou a ser o código estável (`missing-pilot-information`) e o campo exato
  foi para `reasonDetail`.

**Verificação**

- `npm test`: **110/110** (antes 83/87, com 4 falhas pré-existentes em `coverage-taxonomy` e
  `dialogue-baseline`).
- `npm run test:dialogue`: 9/9 (validador + 8 roteiros); `npm run validate:dialogue-matrix` OK.
- `npx vite build` OK; `npm run validate` OK (índice reproduzível, 374 chunks).
- Caracterização do F0 regenerada de forma deliberada: 338 diferenças, todas nas categorias
  pretendidas (avaliador único `cotejamento`, `autorizacao_pendente` no contexto, autorização
  cotejada preservada, menos omissões espúrias). `--check` estável depois da regeneração.

**Não feito / aberto**

- A3.13 (duas interfaces) e a Decisão 0 do plano ficaram abertas nesta entrega — o Voice Lab seguiu
  como caminho provisório com o Vercel AI SDK opcional. Resolvidas na execução 5 (F7).
- F6: tabela oficial de janela de contexto por modelo `:free` não confirmada (o módulo usa teto
  conservador configurável em vez de presumir valores).
- Testes de DOM do `web/app.js` (jsdom/happy-dom) para o fluxo de PTT continuam pendentes: a
  máquina de estados é testada sem DOM, mas o binding de `pointerdown`/`pointerup`/`pointerleave`
  não tem teste automatizado.
- A3.15/A3.16/A3.17 ficaram registradas nesta entrega; a matriz fixava o comportamento então atual
  de A3.17 (pouso sem transição válida) e da troca de frequência como divergências explícitas, para
  não regredir em silêncio. Encerradas nas execuções 4 e 5.

## Registro de divergências (A3.x)

| ID | Divergência | Status |
|---|---|---|
| A3.1 | Intents que o LLM produz caem em falso "sem cobertura documental" | **Resolvida**: taxonomia com motivo explícito (`family-not-implemented`) e variantes para `position_report`/`unable`; nenhuma decisão afirma ausência sem prova |
| A3.2 | `missingOperationalInformation` e `uncertainElements` do LLM são descartados | **Resolvida**: `missingOperationalInformation` é consumido pela decisão (só sobre requisito documentado, registrado em `llmFlaggedFields`); `uncertainElements` fica no diagnóstico e na interpretação porque o parser determinístico também escreve nesse campo |
| A3.3 | Um intent → um artigo fixo impede §7/§8 (fogo nunca cita o art. 66) | **Resolvida**: variantes multi-fonte — "fogo" cita art. 66 + art. 43 e "pane de motor" cita art. 64 (`test/coverage-taxonomy.test.js`) |
| A3.4 | Dois avaliadores de cotejamento divergentes; art. 12 §1º/§2º não implementados | **Resolvida** (avaliador único + autorização pendente) |
| A3.5 | PLANO-CORRECOES aponta ICA 100-12, que não tem provisão de cotejamento | **Resolvida na execução**: a base de cotejamento é MCA 100-16 art. 5º/12/45 (A3.4/`readback-rules.js`); a nota permanece como registro da divergência do documento antigo |
| A3.6 | O diálogo não é estado (sem pergunta pendente) | **Resolvida**: `contexto.pergunta_pendente` + precedência de diálogo (`src/dialogue.js`, `test/dialogue-state.test.js`) |
| A3.7 | `artigo-0005` e `artigo-0018` são inalcançáveis: `fases: ["coordenacao"]` fora de `PHASES` | **Resolvida quanto ao efeito**: a recuperação da decisão não depende mais do art. 5º (a fundamentação do cotejamento é o art. 12, com citação). Os chunks de `coordenacao` seguem fora do BM25 de fase, sem alteração de corpus/metadados — a alternativa permitida pelo plano (§I5) |
| A3.8 | Recuperação depende da fase forçada em `PROFILES` (art. 12 só é alcançável por isso) | **Substituída**: `PROFILES` não existe mais; a fase vem da regra documental da família (`evidence-rules.js`), declarada e citada, com teste de cotejamento em PT/EN (`test/readback-language-coverage.test.js`) |
| A3.9 | TTS mudo em esclarecimento e recusa | **Resolvida** |
| A3.10 | Rótulo do PTT expõe estágios internos do pipeline | **Resolvida** |
| A3.11 | Fallback de modelo invisível, sem preferência e sem rota de catálogo | **Resolvida** (rota de catálogo dispensada: a lista de candidatos é pública em `server/model-registry.js`) |
| A3.12 | Orçamento de contexto fixo (2 transmissões / 2.000 chars) | **Resolvida**: janela vem do catálogo público, sem corte fixo em `src/` e com origem registrada |
| A3.13 | Duas arquiteturas de aplicação independentes | **Resolvida**: interface única (`index.html` + `web/app.js`), caminho paralelo removido |
| A3.14 | Cotejamento sem fonte citável em inglês | **Resolvida** (`145f7c7`) |
| A3.15 | Cotejamento reclassificado como solicitação nova | **Resolvida com justificativa**: o §12 exige item cotejável; uma autorização sem item do art. 12, III (art. 59) não é cotejamento, e a fala segue a intenção documentada — comportamento explícito na matriz, em `test/dialogue-state.test.js` e no ato de diálogo |
| A3.16 | Ambiguidade criada pelo próprio parser depois de uma autorização | **Resolvida**: a interpretação é reescrita pelo contexto antes da recuperação (`resolveDialogueInterpretation`), então o cotejamento busca como cotejamento e o turno deixa de cair em `not_understood` |
| A3.17 | Autorização emitida sem transição de estado válida | **Resolvida**: o pouso autorizado passa pela aproximação (`advancePhase`), nunca por salto de fase |

## Hipóteses que o plano assumia e a execução precisa revisar

| Hipótese do plano | Situação atual |
|---|---|
| Taxonomia com `no_documentary_coverage` | Em revisão no F1: o nome afirma ausência de cobertura no manual, que é exatamente a causa-raiz de A3.1. A execução separa "nenhuma base recuperada" de "cobertura documental inexistente" por **código de motivo**, e a fala nunca afirma ausência sem prova. |
| Lista de cotejamento de `docs/PLANO-CORRECOES-2026-09.md` viria do ICA 100-12 | Resolvido: a base é MCA 100-16 art. 5º/12/45 (ver A3.5). |
| `server/auto-free-provider.js` | O módulo real é `src/llm/auto-free-provider.js`. Corrigido no plano. |

## Pendências de verificação (não bloqueiam a execução)

- `.env.example` não pôde ser lido pela ferramenta de leitura (arquivo tratado como sensível).
  Contorno adotado na execução 4: os nomes lidos pelo código estão documentados no README, seção
  "Variáveis de ambiente e custo zero", e conferidos por busca no próprio código.
- Os PDFs de origem não estão no repositório: a reconciliação do corpus com os documentos originais
  continua pendente (registrado em `docs/PIPELINE_CONTEXTUAL.md` e no §9.1 de `atc-simulator-plano.md`).
- ~~Worktree órfão `.kilo/worktrees/fossil-network`~~ — conferido na execução 4: não existe mais
  (`git worktree list` mostra apenas a raiz). Item encerrado.
- `docs/PLANO_REF.md` está versionado (deixou de ser untracked). Item encerrado.
- Validação pedagógica do cotejamento com instrutor permanece humana (F8).

### 4. Fechamento de F1 e F6, mais A3.17

Executado sobre `docs/REFATOR_DEEP.md` (fases F1 e F6, divergências A3.2/A3.12/A3.15/A3.17).

**Entregue**

- **F6 — janela real do candidato:** `src/llm/context-budget.js` passou a derivar o orçamento do
  `context_length` do **catálogo público** do OpenRouter (`freeModelMetadata` em
  `src/llm/openrouter-provider.js`, reaproveitando a consulta que a validação gratuita já faz — sem
  chamada extra), menos `RESPONSE_RESERVE_TOKENS`. Precedência explícita: configuração do operador →
  janela do catálogo → teto conservador; metadado ausente nunca vira estimativa e nunca adota o maior
  valor conhecido (risco I11). O resultado registra `{ budget, source, contextLength, estimatedTokens,
  trimmed, historyBefore, historyAfter }` e chega a `?debug=1` via `diagnostics.contextBudget`.
- **F6 — fim do corte fixo:** `limitedSessionContext` deixou de cortar em 2 transmissões/500 chars e
  `interpretSemantically` deixou de cortar as transcrições em 2.000 chars; `trimPayload` desconta o
  restante do payload do orçamento do histórico, corta o histórico **mais antigo primeiro** e encurta a
  string longa quando ela sozinha não cabe, preservando indicativo, aeródromo, fase, frequência,
  pista, última autorização, autorização/pergunta pendente e situação de emergência. O navegador corta
  pelo teto conservador antes do transporte; o limite de corpo do endpoint subiu para comportá-lo.
- **F1 — sinal do LLM consumido (A3.2):** `src/knowledge.js` usa `missingOperationalInformation` como
  **entrada** da decisão: se a interpretação declara materialmente ausente (ou duvidoso) um dado que a
  variante documentada exige, a decisão pergunta em vez de autorizar com o valor presumido. O sinal
  **não cria** pergunta sem base documental e não substitui a variante escolhida pela documentação;
  os requisitos afetados aparecem em `diagnostics.llmFlaggedFields`.
- **F1 — fim do mapa fixo:** `src/controller.js` não tem mais nenhum artigo associado a intenção (a
  detecção lexical legada ficou só com termos); a fundamentação vive em `evidence-rules.js`.
- **F1 — ADR-003:** `docs/ADR-003-DIALOGO-E-EVIDENCIA.md` registra a decisão (evidência descoberta por
  predicado documental, decisão separada da realização, diálogo como estado, contexto resolvendo
  ambiguidade do léxico) com a verificação de cada critério.
- **A3.17:** `advancePhase` em `src/state-machine.js` dá o **primeiro passo de um caminho válido**
  entre fases. O pouso autorizado com a fase em `decolagem` (emergência após a decolagem) passa a
  deixar o estado em `aproximacao` — a autorização nunca mais é emitida com o estado incoerente —,
  sem inventar fase nem saltar transição. No solo o pedido de pouso não altera a fase.

**Verificação**

- `npm test`: **113/113** (novos casos: sinal do LLM consumido, orçamento por catálogo, janela pequena
  que corta em vez de recusar).
- `npm run test:dialogue`: 9/9, com a matriz afirmando `fase: aproximacao` no turno de pouso da
  emergência (o turno falharia sem a correção de A3.17).
- Caracterização do F0 regenerada de forma deliberada em duas etapas e conferida por diff: **50**
  diferenças, todas `sessaoContexto.*` (F6: histórico completo em vez de 2 itens), e depois **1**
  mudança de fase (`pt_ifr_partida_emergencia_com_fogo` turno 7) mais a consequência do mesmo turno em
  `pt_emergencia_motor_em_rota` — nenhuma categoria fora das pretendidas.

**Não feito / aberto**

- F7 (uma única interface) continua pendente de **remoção**: `voice.html` + `src/App.jsx` e o
  caminho `/api/generate-reply` sem grounding (com a cadeia `server/providers.js` e o provider
  opcional do Vercel AI SDK, que só serve a esse caminho) seguem existindo. É a única fase que exige
  apagar arquivos e dependências (React), então precisa de decisão explícita do usuário.
  O que **já foi portado** para a interface oficial (itens 1, 3 e 9 do inventário): indicação de
  idioma da sessão com alternância para o cenário equivalente (o idioma determina base documental e
  voz, então a sessão reinicia), aviso visível de indisponibilidade da Web Speech para entrada e para
  fonia, e erro de permissão de microfone já declarado na conversa. Com isso, quando a remoção for
  aprovada, o F7 fica sendo apenas apagar o caminho paralelo e verificar referências órfãs.
- F8 (auditoria final) não foi executada por completo: depende de F7 e da conferência humana no
  navegador (microfone físico, vozes instaladas).
- A3.16 está resolvida em código e na matriz desde a execução 3 (a interpretação é reescrita pelo
  contexto antes da recuperação); mantida aqui para rastreabilidade.

### 5. F7 — unificação da interface e descontinuação da paralela

Executado conforme a decisão **D1/opção A** do plano: `index.html` + `web/app.js` é a arquitetura
definitiva; o caminho paralelo foi removido **depois** de portar o que tinha valor.

**Portado antes de remover (checklist do F0, `docs/INVENTARIO-APP-JSX.md`)**

- item 1 — indicação de idioma da sessão + alternância para o cenário equivalente (`#language-status`
  e `#language-toggle`), porque o idioma determina a base documental recuperada e a voz;
- item 3 — aviso visível quando a Web Speech API não existe (entrada por voz e/ou fonia), com o PTT
  desabilitado e o caminho por texto declarado;
- item 9 — erro `microphone_error` declarado na conversa;
- itens 2, 4 e 8 já tinham sido absorvidos no F4 (canal de rádio dirigido pelo fim do TTS, soltura
  capturada na `window`); item 5 substituído pelo orçamento de contexto do F6.

**Removido**

`voice.html` · `src/App.jsx` · `src/main.jsx` · `src/styles.css` · `src/services/generateReply.js` ·
`api/generate-reply.js` · `server/generate-reply.js` · `server/providers.js` ·
`server/ai-sdk-provider.js` · `public/radio-mark.svg` · `test/providers.test.js` ·
`test/ai-sdk-provider.test.js` · dependências `react`, `react-dom`, `@vitejs/plugin-react`, `ai`,
`@ai-sdk/openai` e o script `test:ai-sdk`. Itens 10 e 11 do inventário: **descartados** (asset órfão
sem conteúdo operacional; `web/styles.css` já cobre a linguagem visual).

**Também ajustado**

- `vite.config.js`: uma única entrada de build e só as rotas `/api/interpret-transmission` e
  `/api/transcribe` no middleware de desenvolvimento;
- `server/cost-policy.js`: removida a exceção `aiSdkOptIn`. A política de custo passou a não ter
  **nenhuma** brecha para provider pago — a única saída paga do projeto era aquele opt-in;
- `index.html`: link "VOICE LAB" removido;
- `package-lock.json` atualizado (204 linhas de dependências removidas) e build com uma entrada
  (`dist/assets/simulator-*.js`, sem chunk de voz).

**Verificação**

- `npm test`: **105/105** (os 8 testes do caminho paralelo saíram junto com ele; nenhum teste da
  arquitetura oficial foi alterado); `npm run test:dialogue`: 9/9.
- `npm run audit` completo verde, índice reproduzível com 374 chunks, `npx vite build` produzindo
  **uma** entrada.
- Busca por referências órfãs (`voice.html`, `App.jsx`, `main.jsx`, `generate-reply`, `radio-mark`,
  `ai-sdk`, `react`) em `src/`, `server/`, `api/`, `test/`, `scripts/`, `index.html`, `package.json`,
  `vite.config.js`: **zero** ocorrências fora de comentários históricos.

### 6. F8 — auditoria final e validação integrada

Executada **depois** de F5/F6/F7, como o plano exige (a matriz do F3 não pode ser validada antes das
mudanças de contexto e da unificação da interface).

**Verificação executada**

- `npm run audit` completo e verde: `npm test` **105/105**, `npm run test:dialogue` **9/9** (matriz
  normativa reexecutada após F6/F7), `npm run validate` (índice reproduzível, 374 chunks),
  `npm run audit:corpus` e build com **entrada única**.
- Busca por caminhos proibidos: nenhuma ocorrência de `gemini` em `src/`, `server/` ou `api/`;
  nenhum modelo sem `:free` alcançável (`server/cost-policy.js` sem exceções);
  `GROQ_FREE_TIER_CONFIRMED=false` mantém o Groq inalcançável.
- Referências órfãs do caminho removido: zero fora de comentários históricos.

**Documentação consolidada**

- `README.md` — arquitetura única, seção de descontinuação, lista de variáveis sem os nomes do AI SDK,
  comandos sem `test:ai-sdk`, implantação sem `/voice.html`.
- `docs/PIPELINE_CONTEXTUAL.md` — fluxo de produção reescrito para F1/F6/F7 (resolução no contexto,
  predicado documental, taxonomia de cobertura, realização com citação, orçamento de contexto).
- `docs/ADR-001-LLM-FIRST.md` — nota de estado atual apontando para ADR-002/ADR-003 (o corpo continua
  descrevendo o provider original, como registro histórico).
- `docs/ADR-003-DIALOGO-E-EVIDENCIA.md` — decisão do F1 com a verificação de cada critério.
- `docs/INVENTARIO-APP-JSX.md` — checklist do F7 fechado, item por item.

**Limitações declaradas (mantidas visíveis)**

- os PDFs de origem não estão no repositório: a reconciliação do corpus com os documentos primários
  continua pendente (`docs/PIPELINE_CONTEXTUAL.md`, §9.1 do plano do simulador);
- a validação pedagógica do cotejamento com instrutor é humana;
- microfone físico, permissão de microfone e vozes instaladas dependem de conferência humana no
  navegador/sistema de destino — nenhum teste automatizado os substitui.

### 7. Revisão pós-merge do PR #7 (`ecaa9c1`) — sem alteração de código

**Escopo.** A revisão foi pedida sobre "as mudanças não commitadas". `git status --porcelain` está
vazio em `main` (`3d58cf9`): não há alteração pendente, e o objeto real da revisão é o diff já
mergeado em `ecaa9c1` (PR #7) — 52 arquivos, +3130/−1422. **Nenhum arquivo foi alterado nesta
execução**; os achados ficam registrados para correção e são o item 1 do próximo passo.

**Verificação executada**

- `npm test`: **105/105** verde (o `node --test test/*.test.js` inclui os 9 casos da matriz do F3).
  Os achados abaixo são, portanto, lacunas que a suíte **não** vê — não testes vermelhos.
- Sondas reprodutíveis com `node --input-type=module -e` sobre os módulos reais (sem alterar
  arquivos), registradas em cada achado.

**Achados**

**C1 — Crítico (corrigido na execução 8). `web/app.js:217` usa `speakTransmission` sem importar: a fonia inteira está morta.**
A linha 5 importa apenas `{ createRecognitionSession }`; antes deste commit a mesma linha era
`import { createRecognitionSession, speakTransmission } from '../src/speech.js';`
(`git show 7ab80e5:web/app.js`). Em módulo ES a chamada lança `ReferenceError` em tempo de execução,
dentro do `try` de `speakReply`, que o captura e chama `finish()` → o canal volta a `livre` e, fora de
`?debug=1`, **nada** indica a falha. Nem Vite nem rollup acusam (variável livre é tratada como global),
e `test/tts-coverage.test.js` passa porque afirma `shouldSpeak`, não o ponto de chamada. Consequência
direta: o critério de F7/A3.9 ("toda fala do controlador é falada") e o de A3.10 ("o canal volta a
`livre` no fim do TTS") não estão em efeito. **Correção:** reimportar `speakTransmission`.

**A1 — Alto (corrigido na execução 8, com correção de escopo). `src/dialogue.js:141` avalia
`REQUEST_MARKERS` antes de `answersPending`, e por substring.** `confirme|confirm` casa também com `confirmado`/`confirmo`, e o ramo tem precedência
sobre a resposta à pergunta pendente. Reproduzido com `pergunta_pendente = 'parte da aeronave'` e uma
autorização de fogo no estado:

```
"Fogo no motor direito."              -> answer
"Confirmado, fogo no motor direito."  -> unrelated   (controlador reformula a mesma pergunta)
"Confirmo: fogo no motor direito."    -> unrelated
```

Como a pergunta pendente é justamente uma frase que começa por "confirme…", o prefixo em colisão é
prosa de treino provável, e o piloto que responde "confirmado" entra em laço. **Correção:** testar
`pending && answersPending(...)` **antes** do ramo de `REQUEST_MARKERS` (um pedido ao controlador sem
vocabulário da pergunta pendente continua caindo lá).

**M1 — Médio (corrigido na execução 9). `web/app.js:44` acessa `localStorage` no topo do módulo, fora
de `try/catch`** (novo em F5; não existia antes do commit). Onde o acesso a storage lança
(`SecurityError` em contexto sandbox/iframe ou storage bloqueado), o corpo do módulo não avalia e o
simulador fica em branco — o `try/catch` do fim do arquivo só cobre o carregamento do índice.
**Correção:** acessador seguro (get/set/remove com `try/catch`).

**M2 — Médio (corrigido na execução 9). `web/app.js:387` põe `pointerleave` no botão PTT, o que é mais
amplo que o requisito do F4.** O `pointerup`/`pointercancel` na `window` já implementa "soltar em
qualquer lugar da tela"; o `pointerleave` **adicionalmente** encerra a captura quando o cursor apenas
sai do botão com o PTT pressionado — o que contradiz o texto de ajuda do painel ("a gravação termina
quando você soltar em qualquer lugar da tela"). Rede de segurança mais estreita: `blur` da `window`
ou `pointerout` com `relatedTarget === null`; alternativamente, ajustar o texto de ajuda. **Correção:**
decidir a intenção e fixá-la em teste — hoje nenhum teste cobre esta fiação.

**B1 — Baixo (corrigido na execução 9). `src/llm/context-budget.js:92` não implementa o piso que o próprio docstring promete.**
O comentário diz que `shortenHistoryItem` devolve `null` quando "nem a versão mais curta útil cabe — o
item é descartado em vez de virar um fragmento"; o laço só termina em `text.length <= 1`. Reproduzido:
com orçamento 25 o item mantido é `"transmissao muito longa transm"` (fragmento truncado no meio da
palavra). **Correção:** piso mínimo (comprimento ou fração do original) ou remover a promessa do
comentário.

**B2 — Baixo (corrigido na execução 9). `src/controller.js:92` — `sourceIds: pending.sources ?? []` é expressão morta.**
`createPendingQuestion` nunca define `sources`, então a reformulação da pergunta sempre reporta zero
fontes, embora tenha `pending.citation` (e `diagnostics.evidenceCitation` seja `null` nesse caminho).
**Correção:** derivar os ids da realização composta ou remover a expressão.

**B3 — Baixo (corrigido na execução 9). `server/interpret-transmission.js:39` — os códigos novos do F6 não estão no mapa de
status.** `context_budget_exceeded` e `llm_context_budget_exceeded` caem no `?? 502`. O código **chega**
ao cliente no corpo da resposta (a UI mostra "interpretação determinística
(llm_context_budget_exceeded)"), mas o status HTTP não representa o pulo deliberado documentado no
README. **Correção:** mapear explicitamente (503).

**B4 — Baixo (corrigido na execução 9). `web/app.js:71-84` — seletor e indicador de modelo podem discordar.** `select.value =
preferredModelId` cai silenciosamente em "Automático" quando o id persistido não está mais no catálogo,
enquanto `renderModelStatus(null)` continua exibindo `preferido: <id>`; além disso o listener de
`change` é readicionado a cada chamada de `renderModelSelect()`. **Correção:** validar contra
`modelCandidates()` e registrar o listener uma vez.

**Testes que faltam (o que teria pegado os achados)**

- **Nenhum teste carrega `web/app.js`** — o arquivo dono da fiação de PTT/canal/idioma/fonia/modelo.
  É a causa única de C1 (e deixaria passar M1/M2). Alternativas sem dependência nova: teste de fiação
  rodando o módulo contra um stub de `document`/`window` (mesmo estilo de injeção de `scope` já usado
  em `src/speech.js`) ou teste estático de que todo identificador chamado em `web/app.js` é
  importado/declarado/global.
- **`advancePhase` sem teste unitário** (só um turno da matriz o exercita). Sonda: `decolagem → pouso
  = aproximacao`, `rota → pouso = aproximacao`, `aproximacao → pouso = pouso`, `pouso → pouso = null`,
  `encerrado → pouso = null`; e o no-op de `landingTransition` no solo (`fase: 'solo'` → sem mudança de
  fase nem de frequência).
- **Caminho de encurtamento do item de histórico** (`shortenHistoryItem`): os testes atuais de
  `trimSessionContext` afirmam só "o histórico encolheu".
- **`languageSibling`/`renderLanguage`/`renderSpeechSupport`:** sonda confirma `vfr_local_pt ⇄
  vfr_local_en`, mas `ifr_partida_pt` e `emergencia_motor_pt` **não têm irmão** — o botão de idioma
  precisa ficar desabilitado nesses dois cenários, e isso não está afirmado em teste.

### 8. Correção de C1 e A1 com testes de regressão

Executada sobre os achados da execução 7. Nada de M1/M2/B1–B4 foi tocado aqui.

**Entregue**

- **C1 — a fonia volta a existir:** `web/app.js` importa de novo `speakTransmission` de
  `src/speech.js` (a chamada em `speakReply` nunca saiu do arquivo; a `ReferenceError` era engolida
  pelo `try`). Com isso a política de fonia do F7 (toda fala do controlador é falada) e o critério de
  A3.10 (canal liberado no fim do TTS) voltam a estar em efeito.
- **A1 — resposta à pendente antes do pedido de confirmação:** em `src/dialogue.js`
  (`evaluateDialogue`), a resposta à pergunta pendente passou a ser avaliada **antes** de
  `REQUEST_MARKERS`, que é procurado por substring e casa com "confirmado"/"confirmo" — e a pendente
  é, ela própria, um pedido de confirmação (art. 39, CONFIRME). A precedência documentada no cabeçalho
  foi reescrita (3 = resposta à pendente, 4 = pedido de confirmação) e comentada no ponto de decisão.
- **Correção de escopo do achado A1:** a reprodução registrada na execução 7 usou uma interpretação
  construída à mão **sem** `emergency: true`. No pipeline real, a resposta de fogo já era atendida pelo
  ramo de emergência, que precede os marcadores; a superfície real do defeito é a pergunta pendente
  **não-emergencial** (destino ou setor, art. 122). Confirmado por sonda antes e depois da correção:
  antes, `"Confirmado, VFR saída para o setor norte"` → `unrelated` + `needs_clarification`
  (reformulação); depois → `answer` + `documented`, citando o art. 122.

**Testes de regressão (novos)**

- `test/app-wiring.test.js` — **fiação do app oficial**, o arquivo que nenhum teste carregava:
  1. todo identificador **chamado** em `web/app.js` precisa estar vinculado (import, declaração de
     topo ou global), com o import da fonia afirmado explicitamente. A checagem é validada contra uma
     **cópia mutilada** do próprio arquivo, que precisa acusar exatamente `speakTransmission` — o teste
     não passa por vacuidade;
  2. o app é **executado** contra um `document`/`SpeechSynthesis` de mentira: `submit` → pipeline →
     TTS, afirmando que a fala emitida é `prepareSpeechText` da resposta do controlador, que o canal
     fica `RECEBENDO` durante a fonia e só volta a `LIVRE` no `onend` (A3.10), e que a pergunta sem
     cobertura documental também é falada (A3.9), não apenas exibida.
- `test/dialogue-state.test.js` — caso novo de A1: com pendente "destino ou setor",
  `"Confirmado, VFR saída para o setor norte"` e `"Confirmo: …"` são `answer`/`documented` (art. 122) e
  encerram a pendente; `"Confirme minha autorização"` continua **não** sendo resposta (o controlador
  reformula) e, fora do contexto de pendente, segue `normal`.

**Verificação**

- `npm test`: **108/108** (105 anteriores + 2 de fiação do app + 1 de A1).
- `npm run test:dialogue`: **9/9** (matriz normativa reexecutada).
- **Prova de que os testes pegam os defeitos:** os mesmos arquivos de teste rodados contra o commit
  pré-correção (`3d58cf9`, em worktree descartável) falham **exatamente** nos três casos novos —
  `"o import da fonia precisa vincular speakTransmission e createRecognitionSession"`,
  `"tempo esgotado: a resposta do controlador não foi falada"` e o caso de A1 —, com os 8 casos
  restantes verdes. Worktree removido; árvore de trabalho intacta.

**Não feito / aberto**

- M1 (`localStorage` sem guarda), M2 (`pointerleave` no PTT), B1–B4 seguem abertos, como registrado na
  execução 7.
- **Achado pré-existente, observado ao sondar A1 (não corrigido, não introduzido por C1/A1):** em
  `src/knowledge.js` (`unmetRequirement`), o ramo `detected` considera o requisito satisfeito só por o
  **termo** aparecer na fala, sem exigir que exista valor; `src/phraseology.js`
  (`vfr_departure_clearance`) então interpola `destination` sem guarda. Reproduzível no `main` **com e
  sem** as correções desta execução (turno inicial, sem pergunta pendente), ou seja, é anterior:
  - `"PT-ABC, VFR, confirme o destino"` → `PT-ABC, saída VFR para undefined, pista 18, QNH 1015.`
  - `"PT-ABC pretende saída VFR para o setor"` → `PT-ABC, saída VFR para o, pista 18, QNH 1015.`

  Viola a regra de ouro (fala sem dado documentado) e fala "undefined" ao treinando. Direção de
  correção: exigir **valor** (não só menção) no requisito — `fromInterpretation`/`sessionField` — e/ou
  a realização recusar-se a compor quando um dado declarado como necessário estiver ausente.

### 9. Fechamento dos achados M1, M2, B1–B5 da revisão pós-merge

Executada sobre os achados que a execução 7 registrou e a 8 não fechou. Todos os itens da lista de
achados da revisão estão resolvidos; nenhum achado novo foi aberto.

**Entregue**

- **M1 — armazenamento opcional não derruba o app:** `web/app.js` passou a ler e gravar a preferência
  de modelo por `safeStorage` (get/set/remove com `try/catch`). Onde `localStorage` lança, a sessão
  segue em "automático" — o simulador continua inteiro.
- **M2 — a captura termina na soltura, como o F4 exige:** o `pointerleave` do botão foi removido e a
  rede de segurança passou para `blur` da `window`, que cobre soltar **fora** da janela (onde nenhum
  `pointerup` chega) sem abortar o hold-to-talk quando o cursor apenas sai do botão. O texto de ajuda
  do painel ("a gravação termina quando você soltar em qualquer lugar da tela") agora descreve a
  comportamento real.
- **B1 — piso ao encurtar o histórico:** `shortenHistoryItem` agora impõe o piso que o próprio
  docstring prometia (maior entre 40 caracteres e um quarto do original, limitado ao tamanho do item).
  Uma transmissão de 1.620 caracteres vai a 810 → 405 → descartada; antes, qualquer orçamento entre
  elas produzia um fragmento que não representava a transmissão.
- **B2 — expressão morta removida:** `pendingQuestionReply` passou a declarar `sourceIds: []` com o
  motivo (reformular a pergunta não é citar cobertura; a citação vive em
  `pendingQuestion.citation`).
- **B3 — status HTTP do pulo por orçamento:** `context_budget_exceeded` e
  `llm_context_budget_exceeded` entram no mapa com 503, em vez de cair no 502 de erro desconhecido.
- **B4 — seletor e indicador sempre concordam:** a preferência persistida é normalizada na leitura
  contra `FREE_LLM_CANDIDATES`; um id que saiu do catálogo deixa de ser preference e vira "automático"
  em seletor, indicador e transporte. O listener do seletor passou a ser registrado uma vez, fora do
  render.
- **B5 — menção não é valor (achado pré-existente):** `unmetRequirement` passou a exigir o **valor**
  quando o requisito declara de onde ele vem (`fromInterpretation`/`sessionField`), e o vocabulário
  falado continua bastando para o requisito que é o próprio valor falado (local do fogo, art. 43
  Tabela 15). Junto, `matchAfter` em `src/transmission.js` deixou de aceitar artigo/preposição como
  valor extraído. Antes: `"PT-ABC, VFR, confirme o destino"` falava `saída VFR para undefined` e
  `"…para o setor"` falava `saída VFR para o`; agora as duas resultam na pergunta documentada do
  art. 122, e o destino verdadeiro continua sendo falado.

**Testes**

- `test/dom-harness.js` (novo, não é teste): harness de navegador compartilhado — `document`, `window`
  com captura de listeners, `localStorage` (inclusive **bloqueado**), `SpeechSynthesis` com `onend`
  controlado pelo teste e microfone falso (`SpeechRecognition`/`getUserMedia`/`MediaRecorder`) para o
  fluxo do PTT. `loadApp` importa `web/app.js` com uma query por cenário, dando uma instância nova
  por stub — o equivalente a recarregar a página.
- `test/app-ptt.test.js` (novo): aperta o PTT, afirma `TRANSMITINDO`, dispara os eventos de saída do
  botão e afirma que **não** encerram, solta na `window` e afirma `RECEBENDO` → transmissão → fala →
  `LIVRE`; um segundo caso afirma que `blur` da janela também encerra a captura.
- `test/app-storage.test.js` (novo): com armazenamento bloqueado, o app inicia, transmite e fala, e
  trocar a preferência não lança; com preferência fora do catálogo, seletor e indicador concordam, e
  uma preferência válida continua valendo.
- `test/model-selection.test.js`: piso do encurtamento (1.620 → 810 → 405 → descartado).
- `test/interpret-api.test.js`: `llm_context_budget_exceeded` responde 503 com o código no corpo.
- `test/coverage-taxonomy.test.js`: novo caso de B5 (valor exigido; artigo não é destino; vocabulário
  falado do fogo continua valendo) e correção do caso de A3.2 — ele afirmava apenas `status` e fixava
  justamente o defeito: sem `destination` na interpretação, a decisão falava `undefined`.
- `test/dialogue-state.test.js`: a reformulação da pergunta não cita cobertura (`sourceIds: []`) e a
  citação está na pergunta pendente.

**Verificação**

- `npm test`: **115/115** (108 + 7 casos novos). `npm run test:dialogue`: **9/9**.
  `npm run test:dialogue-baseline`: **4/4, zero diferenças** — nenhuma decisão caracterizada no F0
  mudou com B5, que só afetaRequirement com valor estruturado.

**Não feito / aberto**

- Nada da revisão pós-merge permanece aberto. Continuam as pendências externas já declaradas
  (reconciliação do corpus com os PDFs, conferência humana de microfone/vozes e validação com
  instrutor) e a evolução de cobertura (`go_around`/`hold_position`).

## Próximo passo

Nenhuma fase do plano está aberta. O que resta é **evolução**, não refatoração:

1. ampliar a cobertura documental por demanda (nova variante em `evidence-rules.js` com citação,
   depois caso na matriz do F3) — por exemplo `go_around`/`hold_position`, hoje declarados como
   `family-not-implemented`;
2. reconciliar o corpus com os PDFs oficiais quando eles estiverem disponíveis;
3. conferência humana no navegador (microfone físico e vozes) e validação com instrutor.
