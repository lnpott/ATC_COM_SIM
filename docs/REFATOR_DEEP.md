# Plano de Refatoração Profunda — ATC_COM_SIM

Derivado de `docs/PLANO_REF.md`. Documento de **planejamento**: descreve *como* levar o
projeto do estado atual ao comportamento final definido naquele briefing. **Não contém
implementação** e não deve ser tratado como fonte de verdade regulatória.

- Data: 22/09/2026
- Base: `main` em `7ed94ca` (`Create PLANO-CORRECOES-2026-09.md`)
- Linha de base verificada: `npm test` = 55/55 verdes; corpus = 374 chunks (MCA 100-16 = 221, ICA 100-12 = 153)
- Fontes de verdade: `atc-simulator-chunks.json` (conteúdo normativo), `docs/*.md` (arquitetura), ADR-001/ADR-002
- Documentos relacionados: `atc-simulator-plano.md`, `docs/PLANO-CORRECOES-2026-09.md`, `docs/PIPELINE_CONTEXTUAL.md`, `docs/GERACAO_CORPUS.md`

## 0. Contrato para o agente executor

Qualquer IA/desenvolvedor que execute este plano deve obedecer, sem exceção:

1. **Verdade documental.** Toda decisão operacional (autorizar, instruir, pedir esclarecimento
   com conteúdo operacional) precisa citar o chunk recuperado que a sustenta. Nenhuma fraseologia,
   autorização ou procedimento pode ser criada por suposição, memória ou analogia com FAA/ICAO.
2. **Teste não é regra.** A ordem é `corpus → definição operacional → arquitetura → implementação → teste`.
   Quando um teste existente divergir da documentação, o plano exige **registrar a divergência**, não
   alterar a lógica para o teste passar.
3. **Não perguntar o que o repositório responde.** Este documento já resolveu as decisões que os
   documentos/código/corpus respondem. O que restou em aberto está em §4.
4. **Custo zero.** Nenhum provider/modelo pago, nenhuma credencial nova além das já previstas em
   `.env.example`, nenhuma cota consumível. `server/cost-policy.js` permanece barreira obrigatória.
5. **Uma fase por vez, com critério de conclusão verificado.** Não avançar com teste vermelho ou
   critério não atendido; registrar o que ficou pendente.
6. **Citar artigo, não intenção.** Onde este plano diz "comprovar na documentação", o executor deve
   abrir o chunk correspondente no corpus e citá-lo (`id` + artigo). Nenhuma regra entra sem citação.

---

## A. Diagnóstico arquitetural

### A.1 Pipeline real hoje

```text
web/app.js transmit()
  → normalizePhraseology(text)
  → limitedSessionContext(state)                    [2 últimas transmissões, 2.000 chars]
  → POST /api/interpret-transmission                [LLM opcional, structured output validado]
      └─ fallback: interpretTransmission(text)      [parser determinístico]
  → processTransmission(text, interpretation)
      → formulateSearch(interpretation)             [PROFILES: intent → artigo fixo]
      → ManualSearch BM25 + retrieveHybrid          [fusão + prior + vizinhos]
      → createGroundedControllerReply               [controller.js: decisão + texto]
      → applyStateUpdate(state, decision.stateUpdate)  [lista fechada de campos]
  → speakTransmission(spokenText)                   [SpeechSynthesis]
```

Camadas corretas e que devem ser **preservadas**: `state-machine.js` (transições e campos
validados, estado externo ao LLM), `grounding.js` (regra de ouro, só cita IDs recuperados),
`cost-policy.js`, `search.js` + índice BM25 reproduzível (`build-index.mjs --check`,
`audit-corpus.mjs`), `schemas.js` (validação local do structured output), `speech.js`
(uma utterance, voz escolhida por score, uma sessão de reconhecimento por PTT),
`normalization.js`, `pipeline.js` (diagnóstico estruturado e opt-in).

### A.2 Distorção central

A **interpretação é LLM-first** (ADR-001, correto). Mas a **decisão e o texto falado são
integralmente determinísticos e fixos** em `src/controller.js`:

- `SOURCE_BY_INTENT` — 9 intents → 9 artigos fixos;
- `replies` — 9 frases fixas por idioma;
- `updates` — 9 atualizações de estado fixas;
- `decideGroundedReply` exige `evidence.find(id === SOURCE_BY_INTENT[intent])`.

Consequência: o grounding funciona como **portão** ("o artigo previamente escolhido apareceu no
top-8?"), não como **gerador**. No vocabulário do §25 do PLANO_REF, o comportamento atual é
"resposta pré-programada" no nível do **artigo/intenção** — um catálogo de 9 decisões, não de
frases. Isso é suficiente para a suíte atual (que testa exatamente esses 9 caminhos) e insuficiente
para qualquer situação atípica, variação ou diálogo de múltiplos turnos.

### A.3 Achados verificados empiricamente

Executados sobre o corpus e o pipeline versionados nesta revisão:

| # | Achado | Evidência |
|---|---|---|
| A3.1 | **Falso "sem cobertura documental"** para intents que o LLM já produz | Pipeline real com `intent=position_report`, `go_around`, `unable` ou `hold_position` → `status=unsupported`, texto "Não há cobertura documental para essa solicitação", `sourceIds=[]`. O corpus tem art. 164 ("Dispensa do reporte de posições"), art. 165 ("Solicitação de reporte de posições"), art. 71 ("Impossibilidade de cumprir instrução ATC") e art. 114/132/154/192 (arremetida). Causa: `INTENT_COMPATIBILITY` cobre ~10 dos 29 intents do schema e `SOURCE_BY_INTENT` tem 9 entradas. |
| A3.2 | **O sinal mais rico do LLM é descartado** | `missingOperationalInformation` e `uncertainElements` são produzidos pelo schema, transportados por `toPipelineInterpretation` e **ignorados** em `controller.js`. Verificado: LLM declara faltar `[pista, qnh, destino]` → o controlador autoriza táxi normalmente. `intentFamily`, `requestType`, `entities` e `semanticSummary` também não são consumidos em nenhum ponto a jusante. |
| A3.3 | **Um intent → um artigo torna §7/§8 inalcançáveis** | "Fogo" só pode citar art. 64 (motor). O corpus tem art. 66 ("Fogo e fumaça a bordo"), estruturalmente inacessível, porque a decisão compara contra um único ID fixo. Não existe mecanismo para relacionar um caso a conhecimento documentado em outro artigo. |
| A3.4 | **A regra de cotejamento está no corpus — e o código a contradiz** | `MCA-100-16-artigo-0005-001` (Art. 5º, I — definição de *Cotejamento*); `MCA-100-16-artigo-0012-001` (Art. 12, III — lista do que deve ser cotejado; § 1º — se cotejada incorretamente, o ATS transmite **"negativo" seguido da versão correta**; § 2º — o órgão pode solicitar cotejamento **discricionário**); `MCA-100-16-artigo-0045-001` (Art. 45 — provisão redundante, com lista mais curta). O código tem **dois avaliadores divergentes**: `evaluateReadback` (lista fixa `REQUIRED_READBACK`, substring, chamada a cada turno quando existe `lastClearance`) e `evaluateReadbackSemantic` (regex, exige tudo que aparece na fala do controlador). Nenhum implementa o § 1º nem o § 2º. |
| A3.5 | **Divergência documental no plano anterior** | `docs/PLANO-CORRECOES-2026-09.md` manda confirmar a lista de cotejamento "no ICA 100-12 (seção de cotejamento)". Neste corpus, **ICA 100-12 não contém provisão de cotejamento**; a base normativa é MCA 100-16 art. 5º/12/45. |
| A3.6 | **O diálogo não é estado** | `needs_clarification` retorna `stateUpdate: null` e nada é registrado. `cotejamento_pendente` é booleano e só existe para readback. Não há noção de "pergunta pendente do controlador", portanto §5 (reconhecer resposta que não responde à pergunta anterior) e §8 (esclarecer "fogo em qual parte") são **estruturalmente impossíveis**: o turno seguinte é interpretado do zero, sem memória da pergunta. |
| A3.7 | **Metadados de fase tornam conhecimento normativo inalcançável** | `src/search.js` valida `fase_de_voo` contra `PHASES = [geral, solo, decolagem, rota, aproximacao, pouso, emergencia]`. Dois chunks têm `fases: ["coordenacao"]` — `MCA-100-16-artigo-0005-001` (**a definição de cotejamento**) e `MCA-100-16-artigo-0018-001` — e **nunca podem ser recuperados** por `ManualSearch`. Distribuição: `geral` 181, `rota` 123, `aproximacao` 79, `pouso` 44, `solo` 41, `decolagem` 26, `emergencia` 24, `coordenacao` 8. |
| A3.8 | **A recuperação atual é dependente de fase forçada** | `retrieval.js` define `PROFILES[intent].phase`; `readback` força `phase: 'solo'`, e é isso que torna `artigo-0012` recuperável (suas `fases` são `solo,decolagem,rota,pouso`, sem `aproximacao`/`emergencia`). Qualquer refatoração da camada de conhecimento que dispense essa forçagem quebra o readback em aproximação/emergência. |
| A3.9 | **TTS mudo em esclarecimento e recusa** | Em `web/app.js`, `transmit()` faz `return` dentro de `if (!reply.covered)` **antes** de `speakTransmission`. Todo `not_understood`, `needs_clarification`, `unsupported` e `operational_context_missing` é silencioso. |
| A3.10 | **PTT expõe estágios internos do pipeline** | `pttLabels = { recording, transcribing, interpreting, searching, responding }` aparecem no rótulo do botão. Sem listener de `pointerleave`; `pointerup`/`pointercancel` só no elemento; o `finally` de `transmit()` não espera o fim do TTS; o botão não é bloqueado enquanto "responde". |
| A3.11 | **Modelos: fallback existe, controle/previsibilidade não** | `src/llm/auto-free-provider.js` (o briefing cita `server/auto-free-provider.js` — não existe) percorre `configuredCandidates` e captura erro por candidato. Mas: sem preferência do usuário, sem rota de catálogo, e `llmProvider`/`actualModel`/`fallbackDepth` só aparecem com `?debug=1`. |
| A3.12 | **Orçamento de contexto é fixo e cego** | `limitedSessionContext` corta em 2 transmissões/2.000 chars iguais para qualquer modelo. Não há estimativa de tokens, reserva para a resposta, nem escolha de candidato por tamanho. |
| A3.13 | **Duas arquiteturas oficiais de fato** | `voice.html` + `src/App.jsx` → `/api/generate-reply` → `server/providers.js` (prompt genérico, sem RAG, sem estado, "não emita autorização real"). `vite.config.js` compila as duas entradas; README publica as duas; `index.html` linka "VOICE LAB". |

Achados **A3.14 a A3.17** foram revelados pelo harness de caracterização criado no F0
(`reference/dialogue-baseline.v1.json`, 7 roteiros / 41 turnos). Eles não eram conhecidos na
análise inicial — o que confirma que a rede multi-turno era necessária antes de tocar F1/F2.

| # | Achado | Evidência |
|---|---|---|
| A3.14 | **Cotejamento não tem fonte citável em inglês** | `MCA-100-16-artigo-0012-001` (art. 12, a provisão de cotejamento) tem `idioma: pt`. Dos 374 chunks, só 119 são alcançáveis em inglês (100 `pt-en` + 19 `en`) e nenhum deles trata de cotejamento. Resultado no roteiro EN: os dois turnos de cotejamento voltam `unsupported` — o mesmo ato operacional é documentado em PT e "sem cobertura" em EN. Não é ausência real de cobertura: é lacuna bilíngue do corpus/índice. |
| A3.15 | **Cotejamento vira "solicitação nova"** | "Ciente, mudança de frequência aprovada" → `frequency_change` / `documented` (o controlador **reautoriza**) em vez de cotejamento; "Ciente saída VFR setor norte" → `vfr_departure` / `documented`. O parser determinístico pontua a solicitação nova igual ou acima do cotejamento, então a separação intenção/autorização do §12 é violada **antes** de o avaliador de cotejamento rodar. |
| A3.16 | **Ambiguidade criada pelo próprio pipeline** | Contém "mayday" → `scoreIntent` força `emergency` a 0.98, então "Ciente Mayday, pista 15 disponível" vira `ambiguous` → `not_understood`; "Ciente, ingresso no circuito pista 18" (cotejamento aguardado após autorização de circuito) empata com `traffic_circuit` → `ambiguous`. São exatamente os casos em que §4/§5 esperam que o **contexto** resolva a ambiguidade — hoje há contexto disponível e ele não é usado. |
| A3.17 | **Autorização emitida sem transição de estado válida** | No roteiro `pt_ifr_partida_emergencia_com_fogo`, um pedido de pouso é respondido `documented` com `fase=decolagem` e a fase **não** muda (`updates.landing_request` só transiciona a partir de `aproximacao`). O controlador autoriza pouso sem o estado acompanhar — falha do §11 (estado validado como fonte da verdade). |

### A.4 O que existe no `App.jsx` com valor a preservar (§17)

O PLANO_REF proíbe apagar a implementação paralela antes de extrair o que tem valor. Inventário:

- alternância PT/EN explícita na UI (o simulador documental troca idioma só pela escolha do cenário);
- `onPointerLeave` no PTT (sinal de que a falta no `web/app.js` é percebida pelo usuário);
- detecção explícita de `speechSupported` + aviso visível quando a Web Speech API não existe
  (`web/app.js` falha de forma mais silenciosa);
- indicadores de canal (radar/status) por estado;
- orçamento de histórico (`slice(-8)`) para o contexto enviado ao LLM.

Nada disso é conhecimento operacional; é apresentação e robustez de interface. Portanto pode ser
incorporado sem violar a verdade documental.

### A.5 Higiene e pendências de verificação

- `docs/PLANO_REF.md` está **untracked** apesar de ser o briefing vigente; decidir versioná-lo (§F8).
- Existe um worktree órfão em `.kilo/worktrees/fossil-network` (HEAD destacado em `7ed94ca`).
- `.env.example` não pôde ser lido pela ferramenta de leitura (mascarado por heurística de segredo).
  O F5 precisa confirmar os nomes nele:  `OPENROUTER_FREE_PRIMARY|SECONDARY|TERTIARY|QUATERNARY|ROUTER`,
  `GROQ_LLM_PRIMARY|SECONDARY`, `GROQ_FREE_TIER_CONFIRMED`, `ZERO_COST_MODE`, `ALLOW_PAID_API`,
  `OPENROUTER_FREE_ONLY`, `LLM_PROVIDER`, `LLM_TIMEOUT_MS`, `STT_GROQ_MODEL`, `GROQ_API_KEY`,
  `OPENROUTER_API_KEY`.
- `docs/ADR-001-LLM-FIRST.md` ainda descreve Gemini no pipeline; a própria ADR-002 já a substituiu
  quanto ao provider. A redação final deve ficar coerente no F8.

---

## B. Lacunas: comportamento atual × comportamento desejado

| # | Lacuna | Referência no PLANO_REF | Estado desejado |
|---|---|---|---|
| B1 | Conhecimento = mapa fixo `intent → 1 artigo`, com prior de metadados sobre o mesmo ID | §2, §7 | Camada de evidência que **descobre** o(s) artigo(s) aplicáveis a partir da interpretação + estado, com **1..N fontes** por decisão, cada regra citando seu artigo. |
| B2 | Não existe ato de diálogo nem expectativa de resposta | §4, §5, §8 | `pergunta_pendente` no estado da sessão; o turno seguinte é avaliado **primeiro** contra a expectativa pendente. |
| B3 | `unsupported` colapsa "sem fonte mapeada", "sem cobertura documental", "dado externo" e "dado de cenário ausente" | §9, §10 | Taxonomia explícita de cobertura (documental / externa / sessão-cenário / esclarecimento / sem cobertura) com status distintos. |
| B4 | Texto do controlador é literalmente `replies[intent]` | §2, §6, §10, §19, §25 | Decisão operacional e realização linguística em etapas separadas; a realização usa padronagem documentada e é bloqueada sem evidência. |
| B5 | "Pendente" é booleano; dois avaliadores contraditórios; art. 12 §1/§2 ignorados | §11, §12 | `autorizacao_pendente` estruturada (`campos`/`obrigatorios`/`informativos`/`discricionario`), avaliador único, comportamento documentado de "negativo" + versão correta. |
| B6 | Suíte testa turnos isolados; sem rede para refatoração | §13, §14 | Harness de caracterização (F0, não-normativo) + matriz de regressão de diálogo (F3, normativa), ambas sobre o pipeline real. |
| B7 | Rótulo do PTT = estágios internos; `pointerleave` ausente; TTS não fecha o ciclo | §18 | Máquina de canal `livre/transmitindo/recebendo`, com bloqueio em `recebendo` e retorno só no fim do TTS. |
| B8 | Fallback invisível, sem preferência, orçamento fixo | §15, §16 | Preferência do usuário sobre candidatos gratuitos (sem desligar failover), modelo visível, orçamento derivado do catálogo vivo e pulo explícito por falta de espaço. |
| B9 | Duas arquiteturas independentes | §17 | Uma única arquitetura oficial; paralela descontinuada **depois** de portar o útil. |

---

## C. Decisões já fechadas (não perguntar)

| # | Decisão | Fundamento |
|---|---|---|
| C1 | **A realização da resposta do controlador é determinística e ancorada em evidência; o LLM não compõe procedimento.** O LLM interpreta e sinaliza faltas/ambiguidade; não autoriza, não escolhe fonte, não altera estado. | ADR-001 ("não compõe procedimentos"), ADR-002 ("LLM apenas interpreta"), §6, §10, §19, §25. |
| C2 | **O estado operacional (incluindo autorização pendente e pergunta pendente) vive fora do LLM**, validado por lista fechada antes de aplicar. | §11; base atual de `state-machine.js` já serve. |
| C3 | **A tabela de obrigatoriedade de cotejamento vem do corpus, não de dedução nem de confirmação humana.** Base: MCA 100-16 art. 5º (definição), art. 12 III e § 1º e § 2º, art. 45 III. | §12 exige achar a definição antes de alterar; a base foi localizada (A3.4, A3.5). |
| C4 | **Orçamento de contexto derivado ao vivo do catálogo do OpenRouter** (`/api/v1/models` expõe `context_length`), não de tabela estática escrita à mão. | §16 proíbe inventar janelas; ADR-002 já exige validação ao vivo do catálogo. |
| C5 | **Fontes externas (METAR/serviço meteorológico) ficam fora do escopo desta execução**; a arquitetura apenas não pode impedi-las. O "dado externo indisponível" ganha status próprio, distinto de "sem cobertura". | §9. |
| C6 | **Voz é interface de entrada/saída.** STT/TTS continuam Web Speech + ASR local; nenhuma mudança de provider de voz. | §17, §18; ADR-002. |
| C7 | **Zero dependências novas de runtime.** Testes de orquestração usam o pipeline real via módulos extraídos (sem "caminho especial para testes"). Se alguma interação realmente presa ao DOM precisar de harness, a dependência entra em `devDependencies` e nada mais. | §13; ADR-002 (a política é sobre providers/custos, não sobre devDeps). |
| C8 | **Vários artigos do manual são aplicáveis à mesma situação**, e a decisão só pode citar o que foi recuperado; a "fonte esperada" deixa de ser um ID fixo e passa a ser um **predicado documental**. | §7 ("a situação pode estar documentada em outro local"), §10. |

---

## D. Decisões realmente pendentes

Estado após esta rodada de análise: **não resta nenhuma decisão pendente que exija confirmação do
usuário.** As três que existiam (interface alvo, ordem das fases e formato de entrega) foram
respondidas e estão registradas abaixo. Resolvidas por análise do repositório/corpus, sem consulta:
lista de cotejamento obrigatório (C3, base em art. 5º/12/45 — A3.4), janelas de contexto (C4,
catalogar ao vivo) e integração meteorológica externa (C5, fora do escopo).

| # | Decisão | Escolha | Justificativa |
|---|---|---|---|
| D1 | Interface oficial única (§17 / Decisão 0 do PLANO-CORRECOES) | **Opção A**: `index.html` + `web/app.js` permanece a arquitetura oficial; portar do `App.jsx` o que tem valor (A.4) e depois descontinuar `voice.html`/React. | É a única interface já ligada a grounding obrigatório, estado validado e BM25 auditável; o PLANO_REF determina que a inteligência está no pipeline, e a UI paralela não tem RAG, estado nem grounding. Menor risco, reversível, e elimina a divergência que é a origem provável de bugs "funciona numa tela e não na outra". A extração de módulos exigida pela Opção B continua sendo feita (F1/F4), então migrar para React depois não fica mais caro. |
| D2 | Ordem das fases | **Aceita a reordenação**: harness de caracterização multi-turno ao final do F0, antes de F1; matriz normativa no F3, depois de F1+F2. | §13/§14 proíbem usar teste como fonte de verdade, mas nada proíbe um **detector de mudança** não-normativo. Sem ele, F1/F2 alteram conhecimento, decisão e cotejamento sem rede de segurança, e não haveria como distinguir regressão de mudança pretendida. |
| D3 | Formato de entrega | Este arquivo (`docs/REFATOR_DEEP.md`), versionado. | Convenção do projeto (`PLANO-CORRECOES-2026-09.md` é versionado); o executor precisa de um artefato estável. |

---

## E. Plano por fases

Cada fase traz os 10 campos exigidos pelo §21: objetivo, problema atual, comportamento final,
componentes, arquivos afetados, dependências, alterações arquiteturais, riscos, como validar,
critério de conclusão.

### F0 — Auditoria, inventário e linha de base

- **Objetivo.** Fixar o estado real do repositório, inventariar o que existe nas duas interfaces e
  criar a rede de segurança multi-turno (não-normativa) que permite refatorar F1/F2 com segurança.
- **Problema atual.** A documentação diverge do código em pontos concretos (A3.5, A3.11, A.5);
  não existe nenhum teste multi-turno; não há registro do que a implementação paralela faz de útil.
- **Comportamento final desejado.** Baseline registrada, divergências formalizadas, inventário do
  `App.jsx` concluído e um detector de mudança capaz de apontar qualquer variação de comportamento
  nos 9 caminhos atuais ao longo de sequências de vários turnos.
- **Componentes envolvidos.** `pipeline.js`, `controller.js`, `state-machine.js`, `retrieval.js`,
  `training.js`, `scenarios.js`, `search.js`, `App.jsx`, `web/app.js`, corpus e índice.
- **Arquivos/módulos afetados (prováveis).** novo `reference/dialogue-inventory.v1.json` (roteiros de
  entrada), novo `reference/dialogue-baseline.v1.json` (snapshot gerado), novo
  `scripts/update-dialogue-baseline.mjs` (harness + gerador + modo `--check`), novo
  `test/dialogue-baseline.test.js`, novo `docs/INVENTARIO-APP-JSX.md` (inventário do F7),
  `package.json` (`update:dialogue-baseline`, `test:dialogue-baseline`), `docs/REFATOR_DEEP.md`
  (registro dos achados), eventual correção factual em `docs/PLANO-CORRECOES-2026-09.md`
  (nota de divergência, sem reescrever).
- **Dependências.** Nenhuma. É o ponto de entrada.
- **Alterações arquiteturais necessárias.** Nenhuma alteração de produção. Introduz-se apenas a
  fronteira de teste: os roteiros são executados **sobre o pipeline real** (`processTransmission` +
  `applyStateUpdate` + `recordTransmission`, o mesmo código que o navegador executa), com o mesmo
  objeto de estado evoluindo turno a turno.
- **Riscos.**
  - O baseline ser lido como "verdade operacional". Mitigação: arquivo e teste carregam aviso
    explícito de que são **snapshot de caracterização**, não regra; regeneração só por script
    dedicado com confirmação explícita (padrão `build-index --check`).
  - Baseline congelar comportamento errado (ex.: `unsupported` para `position_report`). Mitigação:
    cada divergência conhecida é listada como **exceção marcada** (`divergenciaConhecida: <id do item A3.n>`),
    e o F3 deve substituí-la.
- **Como validar.** `npm test` continua 55/55; `npm run test:dialogue-baseline` passa; rodar
  `npm run audit` completo sem alteração de artefatos; conferir que o inventário cobre ao menos um
  roteiro multi-turno por cenário de `scenarios.js`.
- **Critério objetivo de conclusão.** (1) `npm run audit` verde antes de qualquer mudança em `src/`;
  (2) baseline versionada e regenerável de forma determinística (duas execuções → mesmo arquivo);
  (3) inventário do `App.jsx` documentado com decisão *portar/descartar* por item
  (`docs/INVENTARIO-APP-JSX.md`); (4) divergências A3.1–A3.17 registradas com `id` rastreável.

### F1 — Conhecimento, interpretação contextual, diálogo e decisão

- **Objetivo.** Substituir o mapa `intent → artigo fixo` por uma arquitetura em que o conhecimento
  documental é **descoberto** a partir da interpretação e do estado, o diálogo tem memória
  (pergunta pendente) e a decisão operacional é separada da realização linguística.
- **Problema atual.** §A.2, A3.1, A3.2, A3.3, A3.6, A3.7, A3.8. Hoje: 9 intents, 9 artigos, 9 frases;
  o LLM sinaliza informação faltante que é descartada; "fogo" nunca alcança o art. 66; um turno
  nunca sabe que o controlador fez uma pergunta.
- **Comportamento final desejado.** Para qualquer comunicação operacionalmente inteligível:
  o sistema identifica a intenção e a família de intenção, recupera o(s) artigo(s) aplicáveis por
  predicado documental, monta a decisão (autorizar / instruir / pedir esclarecimento / recusar por
  falta de cobertura) com seus parâmetros, atualiza o estado de forma validada, e só então realiza a
  resposta. Perguntas do controlador passam a ser estado: o próximo turno é primeiro confrontado
  com a expectativa pendente. Situações atípicas (emergência com informação crítica incompleta)
  funcionam por composição: comunicação → interpretação → contexto → informação faltante →
  esclarecimento → atualização → recuperação → resposta.
- **Componentes envolvidos.** `src/transmission.js`, `src/pipeline.js`, `src/retrieval.js`,
  `src/controller.js`, `src/grounding.js`, `src/state-machine.js`, `src/llm/semantic-interpreter.js`,
  `src/llm/schemas.js`, `src/training.js`, corpus + índice.
- **Arquivos/módulos afetados (prováveis).**
  - novo `src/dialogue.js` — atos de diálogo, `pergunta_pendente`, precedência e expectativa;
  - novo `src/knowledge.js` — plano de recuperação por predicado documental e seleção multi-fonte
    (consumindo `search.js`/`retrieval.js`);
  - novo `src/knowledge/evidence-rules.js` — regras de evidência por família de intenção, cada
    entrada com `artigo`/`chunkId` de fundamentação (substitui `SOURCE_BY_INTENT` e `PROFILES`);
  - novo `src/decision.js` — decisão operacional (autorizar/instruir/clarificar/recusar) e a
    taxonomia de cobertura do §9;
  - novo `src/phraseology.js` — realização linguística a partir de padronagem documentada, com
    `fontes` obrigatórias (substitui o objeto `replies` de `controller.js`);
  - alterados `controller.js` (passa a orquestrar decisão + realização e a consumir
    `missingOperationalInformation`/`uncertainElements`/`intentFamily`/`requestType`),
    `retrieval.js` (deixa de injetar artigo por intent e passa a receber o plano de `knowledge.js`),
    `state-machine.js` (novo campo de contexto `pergunta_pendente`), `pipeline.js` (novos estágios
    no diagnóstico), `semantic-interpreter.js` (nada de autoridade nova; apenas garantir que os
    campos já previstos cheguem ao pipeline);
  - `docs/ADR-003-DIALOGO-E-EVIDENCIA.md` — decisão arquitetural desta fase;
  - `src/search.js` — apenas se necessário para A3.7 (ver riscos).
- **Dependências.** F0 (baseline + inventário). É pré-requisito de F3 e F7.
- **Alterações arquiteturais necessárias.**
  1. **Predicado documental em vez de ID fixo.** Cada família de intenção declara *que tipo de
     fundamentação* precisa (ex.: "autorização de movimento no solo", "instrução de aproximação",
     "procedimento de emergência"), com o conjunto de artigos candidatos e os termos que os
     caracterizam — cada entrada com citação. A decisão só cita IDs efetivamente recuperados
     (invariante já garantido por `grounding.js`).
  2. **Multi-fonte.** O resultado da decisão passa a ser uma lista de fontes (≥1), permitindo que
     emergências combinem art. 64 (motor) e art. 66 (fogo/fumaça) e que casos atípicos usem
     procedimento geral — exatamente o §7.
  3. **Taxonomia de cobertura (§9).** Status distintos e estáveis: `documented`,
     `needs_clarification` (dado que o piloto deve fornecer), `session_context_missing` (dado de
     cenário/sessão, ex.: frequência de transferência não configurada), `external_source_unavailable`
     (dado dinâmico externo, hoje sempre indisponível por escopo — C5), `no_documentary_coverage`
     (recusa por ausência real) e `not_understood` (fala não interpretável). Regra explícita:
     **ausência de fonte mapeada NUNCA vira `no_documentary_coverage`** (corrige A3.1).
  4. **Uso dos sinais do LLM.** `missingOperationalInformation` determina o que perguntar;
     `uncertainElements` alimenta `needs_clarification`/confiança; `intentFamily` seleciona o
     predicado documental; `requestType` distingue instrução/permissão/informação/reporte/readback.
     O LLM continua sem autoridade: os sinais são **entradas** da decisão, não a decisão.
  5. **Diálogo com memória.** `state.contexto.pergunta_pendente = {kind, intent, campos[], fonteId, criadaEm}`.
     Precedência definida (e testável): emergência/urgência **sempre** preempta; nova solicitação
     operacional clara preempta quando a expectativa pendente não é cotejamento; comunicação
     incompatível com a pergunta pendente **não** cria pedido novo — o controlador permanece no
     contexto e repete/reformula a informação necessária (§5).
  6. **Realização separada da decisão.** A decisão produz uma estrutura de elementos
     (`{nome, valor, papel: instrução|informação, fonte}`); a realização converte isso em fonia,
     citando a padronagem documentada. Elemento de instrução sem fonte recuperada bloqueia a
     decisão; elemento informativo sem fonte é omitido, nunca inventado.
- **Riscos.**
  - **Migrar de "9 caminhos" para "predicados" pode regredir recall.** Mitigação: a suíte atual
    (`contextual-pipeline.test.js`, `heldout-evaluation.test.js`) vira o teste de não-regressão
    imediato, e o baseline do F0 detecta mudanças inesperadas em sequência.
  - **A3.7 depende de metadados do corpus.** Se o predicado precisar citar art. 5º (definição) ele
    é hoje inalcançável (`fases: ["coordenacao"]`). Alternativas: (a) definir `coordenacao` em
    `PHASES` de `search.js` **e** permitir consultá-la; (b) tratar definições/glossário como camada
    de consulta fora do BM25 de fase. A escolha precisa de justificativa escrita e não pode alterar
    o corpus sem passar por `docs/GERACAO_CORPUS.md` (nunca editar só um dos dois JSONs).
  - **A3.8 é acoplamento oculto.** A forçagem de fase em `PROFILES` é o que torna art. 12 recuperável.
    Qualquer troca por recuperação dirigida por interpretação precisa preservar ou reproduzir isso
    explicitamente (teste dedicado: readback em `aproximacao` e em `emergencia`).
  - **Escopo da realização.** Gerar fonia a partir da padronagem documentada é a parte mais aberta.
    Mitigação: começar pelas famílias já cobertas (as 9 atuais) e crescer por demanda da matriz do
    F3, sempre citando o chunk; nada de geração livre.
  - **Tentação de "melhorar" o prompt do LLM para compensar dívida do lado determinístico.**
    Proibido: a autoridade não muda de lado.
- **Como validar.** Suíte existente verde; novo teste de taxonomia (A3.1 → cada intent com cobertura
  comprovada no corpus produz `documented`, e `no_documentary_coverage` só ocorre com ausência
  comprovada); teste de esclarecimento com informação faltante (§8: "fogo" → pergunta "qual parte
  da aeronave"); teste anti-alucinação (nenhuma realização sem `fontes` não vazias); teste de
  preempção (emergência durante pergunta pendente); baseline do F0 revisado item a item, com cada
  diferença classificada como **pretendida** (e virando caso do F3) ou **regressão** (corrigir).
- **Critério objetivo de conclusão.** (1) Zero ocorrências de mapa `intent → único artigo fixo` em
  `src/`; (2) `missingOperationalInformation` comprovadamente consumido (teste que falha se o
  esquema deixar de ser lido); (3) §7 demonstrável: um caso atípico (fogo) citando um artigo
  diferente do caso típico (falha de motor); (4) §5 demonstrável: comunicação sem relação com a
  pergunta pendente não vira solicitação nova; (5) toda decisão do novo motor carrega ≥1 fonte
  recuperada e a citação correspondente; (6) ADR-003 escrita.

### F2 — Estado operacional, autorização pendente e cotejamento

- **Objetivo.** Modelar o que está pendente de forma semântica, com base documental, unificando os
  avaliadores e implementando o comportamento que o manual determina.
- **Problema atual.** A3.4/§12: `cotejamento_pendente` é booleano; dois avaliadores divergentes
  (`evaluateReadback` roda **sempre** que existe `lastClearance`, mesmo fora de readback);
  `evaluateReadbackSemantic` exige tudo mencionado pelo controlador — por isso QNH informativo
  embutido em táxi/circuito/saída VFR vira cotejamento obrigatório; art. 12 § 1º ("negativo" +
  versão correta) e § 2º (cotejamento discricionário) não existem; `emergencia_ativa` nunca é
  liberada.
- **Comportamento final desejado.** Ao emitir uma autorização/instrução, a sessão registra
  `autorizacao_pendente` com os elementos que a compõem, separando `obrigatorios` (cotejamento
  exigido) de `informativos` (reportados, não cobrados). Cotejamento correto encerra o pendente;
  incompleto ou divergente mantém, e o controlador responde conforme o manual ("negativo" seguido
  da versão correta), citando a base. Cotejamento só é avaliado quando existe autorização pendente
  **e** a interpretação do turno é de cotejamento.
- **Componentes envolvidos.** `src/state-machine.js`, `src/training.js`, `src/controller.js` (ou
  `src/decision.js` após F1), `web/app.js`, `src/llm/semantic-interpreter.js`.
- **Arquivos/módulos afetados (prováveis).** novo `src/readback-rules.js` (tabela por tipo de
  autorização, **cada campo com `artigo`** — art. 5º/12 III/45 III); novo `src/readback.js` com
  `evaluateReadbackAgainstPending` (ou consolidação em `training.js`); alterados `state-machine.js`
  (campos de contexto `autorizacao_pendente` e `pergunta_pendente` na lista fechada),
  `training.js` (remoção de `evaluateReadback` e `evaluateReadbackSemantic` após migrar chamadores),
  `web/app.js`/`controller.js`, `test/controller.test.js`, `test/contextual-pipeline.test.js`,
  `test/simulator.test.js`, `test/speech-session.test.js` (se tocar em avaliação).
- **Dependências.** F1 (a decisão passa a ser quem cria o pendente, e o diálogo já usa
  `pergunta_pendente`).
- **Alterações arquiteturais necessárias.**
  1. Substituir o booleano por objeto:
     `{ intent, fonteId(s), campos, obrigatorios[], informativos[], discricionario, criadaEm }`.
  2. **Derivar `obrigatorios` da documentação, não do texto falado.** Regra: um elemento é
     obrigatório quando é instrução/autorização abrangida pelo art. 12 III / art. 45 III
     (pista em uso, ajuste de altímetro **como instrução**, código SSR, nível/altitude, procedimentos,
     horários, fixos, matrícula, frequência, proa, velocidade, níveis de transição); quando aparece
     apenas como informação ao piloto, é `informativo`. Divergência entre art. 12 III e art. 45 III
     (o art. 45 não lista frequência/procedimentos/horários/fixos/matrícula) deve ser **registrada
     em comentário citando ambos**, adotando o conjunto mais completo com justificativa escrita.
  3. Avaliador único alimentado pelo pendente (reaproveitando `operationalValues()`), produzindo
     `correct | incomplete | contradictory` + `missing`/`contradictory` para pedagogia e score.
  4. Comportamento falado conforme art. 12 § 1º; a decisão cita o artigo no `reason`.
  5. Cotejamento discricionário (art. 12 § 2º) como flag, nunca inferido do texto.
  6. Ciclo de vida explícito do pendente: limpo no correto, mantido no incompleto/divergente,
     substituído por nova autorização; `emergencia_ativa` com limpeza definida (fim de emergência
     documentado ou nova sessão).
- **Riscos.**
  - **Ambiguidade do art. 12/45 quanto a QNH.** O corpus lista "ajuste de altímetro"; as respostas
    atuais embutem QNH como informação. A distinção precisa de justificativa explícita por caso e
    teste dedicado (táxi com pista sem QNH de volta = correto; instrução de reajuste de altímetro
    sem retorno = incompleto).
  - **Remover `evaluateReadback` quebra `buildSessionReport`** (depende de `omitidos`/`score`).
    Mitigação: manter o contrato de saída do avaliador (`score`/`omitidos`) para não romper o
    relatório de sessão.
  - **Reversão silenciosa por compatibilidade**: manter os dois avaliadores "por segurança" recria
    o problema. A remoção tem que ser parte do critério de conclusão.
- **Como validar.** Teste de táxi com pista e sem QNH de volta → `correct`; cotejamento divergente
  → resposta com "negativo" e a versão correta; cotejamento avaliado **apenas** com pendente e
  intent de cotejamento (teste que falha se `evaluateReadback` for chamado fora desse caso);
  readback em `aproximacao` e em `emergencia` (guarda do A3.8); sessões distintas não compartilham
  pendente (isolamento já praticado por `createSimulationState`).
- **Critério objetivo de conclusão.** (1) Um único caminho de avaliação de cotejamento em `src/`;
  (2) todo campo obrigatório rastreável a uma citação do corpus; (3) art. 12 § 1º implementado e
  testado; (4) `cotejamento_pendente` booleano inexistente no código; (5) matriz do F3 (próxima
  fase) construível sobre o novo formato sem `if` de compatibilidade.

### F3 — Matriz de regressão de diálogo e cotejamento sequencial

- **Objetivo.** Tornar o comportamento multi-turno verificável, normativamente, sobre o pipeline real.
- **Problema atual.** §13 e B6: a suíte testa transmissões isoladas; o único caso de dois turnos é
  "readback usa autorização da mesma sessão". Uma regressão em que a fase muda errado no meio de um
  voo de 6 turnos, mas cada turno isolado continua "correto", passa despercebida.
- **Comportamento final desejado.** Existe uma matriz versionada de roteiros completos, validada
  estaticamente, e uma suíte que aplica `processTransmission` turno a turno sobre o **mesmo** objeto
  de estado, verificando intenção, status, fontes, fase, frequência e classificação de cotejamento.
- **Componentes envolvidos.** `pipeline.js`, `state-machine.js`, `decision.js`/`controller.js`,
  `training.js`/`readback.js`, `dialogue.js`, `scenarios.js`, índice BM25.
- **Arquivos/módulos afetados (prováveis).** novo `reference/dialogue-regression-matrix.json`;
  novo `scripts/validate-dialogue-matrix.mjs` (padrão de `scripts/validate-search.mjs`); novo
  `test/dialogue-regression.test.js`; `package.json` (`test:dialogue` e inclusão em `audit`);
  `README.md` (documentar o comando e o contrato da matriz).
- **Dependências.** F1 (contrato de decisão e diálogo) e F2 (formato do pendente). O harness do F0
  permanece como detector de mudança; a matriz normativa o **substitui** como verdade de teste.
- **Alterações arquiteturais necessárias.** Nenhuma em produção além do que F1/F2 já entregam.
  Introduz-se o contrato de teste: cada turno declara entrada e expectativas, e cada expectativa
  carrega a **citação documental** que a justifica (para que a matriz não vire regra inventada).
- **Riscos.**
  - **A matriz virar fonte de verdade** (§13, §14). Mitigação: validador estático que rejeita
    `fonte` inexistente no índice, `intent` fora da taxonomia e expectativa sem `justificativa`
    documental; revisão humana do que a matriz afirma.
  - **Roteiros acoplados a detalhes de implementação** (texto exato da resposta). Mitigação: as
    expectativas são estruturais (intenção/status/fontes/estado/classificação), não fraseológicas;
    fraseologia exata fica em casos pontuais e explícitos.
  - **Custo de manutenção** ao crescer a taxonomia. Aceitável: é o contrato do produto.
- **Como validar.** `npm run test:dialogue` verde e falhando ao introduzir, de propósito, uma
  alteração que mude a fase errada no meio de um roteiro; `npm run validate` cobrindo a nova matriz;
  `npm run audit` completo verde.
- **Critério objetivo de conclusão.** Roteiros mínimos: (a) ciclo feliz completo solo→decolagem→rota→
  aproximação→pouso em PT e EN; (b) cotejamento correto, incompleto e divergente em pontos
  diferentes da mesma sequência; (c) emergência no meio do voo em andamento, com mudança de fase
  fora do fluxo linear e atualização de contexto; (d) pedido ambíguo → esclarecimento → resposta
  incompatível (§5) → retomada correta; (e) mudança de frequência como autorização do controlador;
  (f) pedido sem cobertura documental comprovada e pedido que depende de dado externo (§9),
  produzindo status **diferentes**; (g) informação crítica faltante em emergência (§8).

### F4 — PTT e estados de rádio

- **Objetivo.** Tratar o PTT como estado de canal de rádio, não como espelho do pipeline.
- **Problema atual.** A3.10: cinco estágios internos no rótulo; sem `pointerleave`; soltar fora do
  botão pode não encerrar a captura; `recebendo` inexistente (o botão não é bloqueado enquanto o
  controlador responde); retorno a livre não espera o fim do TTS.
- **Comportamento final desejado.** O botão mostra apenas `Livre`, `Transmitindo` e `Recebendo`.
  Em `Recebendo`, o PTT fica indisponível (half-duplex real) e só volta a `Livre` quando o áudio da
  resposta termina (`onEnd`) ou falha (`onError`). Soltar o ponteiro em qualquer lugar da tela
  encerra a gravação. Os estágios finos (`recording…responding`) continuam existindo apenas como
  metadado de diagnóstico em `?debug=1`.
- **Componentes envolvidos.** `web/app.js`, `src/speech.js`, `src/audio-capture.js`, `pipeline.js`
  (diagnóstico).
- **Arquivos/módulos afetados (prováveis).** novo `src/ptt-state.js` (máquina `livre|transmitindo|recebendo`,
  função pura com transições válidas); `web/app.js` (listeners escopados, rótulos, bloqueio, espera
  do TTS); `index.html` (rótulos/atributos do botão); `web/styles.css` (estados visuais);
  novo `test/ptt-state.test.js`; `test/ptt-flow.test.js` (se houver harness de DOM).
- **Dependências.** Independente do LLM. Depende de F0 (baseline) e se beneficia do F1 apenas na
  convenção de nomes. Pode rodar em paralelo a F1/F3, nunca a F2 (ver §F).
- **Alterações arquiteturais necessárias.**
  1. Máquina de estado de canal separada da máquina de pipeline, com mapeamento declarado
     `recording → transmitindo`, `{transcribing,interpreting,searching,responding} + TTS → recebendo`.
  2. Captura de fim de pressão registrada em `window`/`document` **apenas durante operação ativa**
     e removida ao final; `pointerleave` mantido como salvaguarda.
  3. `transmit()` deixa de ser o fim do ciclo: o retorno a `livre` é dirigido por `onEnd`/`onError`
     do TTS (com timeout de segurança, para não travar o canal se o evento não vier).
  4. **Extrair de `web/app.js` um orquestrador agnóstico de DOM** (adaptadores injetados:
     captura, reconhecimento, TTS, cliente semântico, busca) para que a lógica de PTT seja testável
     sem `jsdom`. Se ainda faltar cobertura de fiação de eventos, o harness de DOM entra em
     `devDependencies` (C7).
- **Riscos.**
  - **Travar em `recebendo`** se `onEnd` nunca chegar (voz ausente, navegador sem TTS, aba em
    background). Mitigação obrigatória: timeout de segurança + teste do caminho de erro.
  - **Regressão do atalho de teclado** (`event.detail === 0` alterna start/stop). Precisa de teste
    explícito para não ser removido numa refatoração futura.
  - **Perda de transmissão por soltar fora da janela.** Coberto pelo listener em `window`, mas
    requer teste com `pointerup` fora do elemento.
- **Como validar.** Testes: `pointerdown`→`pointerup` dentro do botão; `pointerdown`→`pointerleave`;
  `pointerdown`→`pointerup` fora do botão (via `window`); botão indisponível em `recebendo`;
  retorno a `livre` após `onEnd` e após `onError`; atalho de teclado; verificação humana no
  navegador (microfone físico continua dependendo de teste humano, conforme ADR-002).
- **Critério objetivo de conclusão.** Rótulos do botão limitados a `livre|transmitindo|recebendo`;
  nenhuma string de estágio interno visível fora do debug; captura sempre encerrada por qualquer
  forma de soltar; TTS comanda o retorno a `livre`; `web/app.js` não contém mais a máquina de
  estados inline.

### F5 — Modelos gratuitos: preferência, visibilidade e continuidade

- **Objetivo.** Dar ao usuário controle **preferencial** (nunca substitutivo) do modelo gratuito e
  tornar o failover visível, preservando sessão, estado e contexto.
- **Problema atual.** A3.11: ordem só por variável de ambiente; modelo invisível fora de `?debug=1`;
  nenhuma rota que exponha candidatos; `/api/generate-reply` sem fallback (caminho paralelo,
  resolvido no F7).
- **Comportamento final desejado.** O usuário escolhe um candidato preferido na interface; se ele
  falhar, a resposta chega pelo próximo candidato; a UI mostra qual modelo respondeu de fato e
  sinaliza troca automática; trocar de modelo no meio da sessão não perde cenário, fase nem
  histórico recente.
- **Componentes envolvidos.** `server/model-registry.js`, `src/llm/auto-free-provider.js`,
  `src/llm/openrouter-provider.js`, `server/cost-policy.js`, `src/llm/semantic-interpreter.js`,
  `src/pipeline.js` (diagnóstico), `web/app.js`, `index.html`, `vite.config.js`, `vercel.json`/`api/`.
- **Arquivos/módulos afetados (prováveis).** novo `server/models.js` + `api/models.js`
  (`GET /api/models` → `[{provider, id, contextLength?}]`, sem segredos); `src/services/` novo
  cliente de catálogo; `auto-free-provider.js` (aceitar `preferredModelId` e **reordenar** mantendo
  os demais como fallback); `server/interpret-transmission.js` (repassar `preferredModelId`
  validado contra a lista configurada — nunca aceitar ID arbitrário do cliente);
  `web/app.js`/`index.html` (seletor + persistência em `localStorage` + indicador sempre visível);
  `vite.config.js` (middleware da rota nova em dev); testes novos.
- **Dependências.** F1 (contrato de decisão/diagnóstico) e F0. Não depende de F6, mas compartilha o
  arquivo `auto-free-provider.js` — executar F5 antes de F6.
- **Alterações arquiteturais necessárias.**
  1. `preferredModelId` **valida** contra `configuredCandidates(env)` no servidor; o cliente nunca
     escolhe modelo fora da lista nem envia provider.
  2. Reordenação preservando o failover: preferido primeiro, resto na ordem da política.
  3. Indicador de modelo como parte do contrato de resposta (não do modo debug): provider,
     `actualModel` e marcador de fallback quando `fallbackDepth > 0`.
  4. Continuidade explícita: um teste que chama o provider duas vezes com candidatos diferentes e
     o **mesmo** estado, comprovando que o payload reconstruído (`limitedSessionContext`) é
     idêntico — a continuidade hoje é estrutural (contexto reconstruído do estado), mas precisa de
     prova.
- **Riscos.**
  - **Preferência virar caminho único** e matar o failover. Mitigação: teste que força falha do
    preferido e exige sucesso do seguinte.
  - **Vazamento de informação de infraestrutura** na rota nova. Mitigação: nunca devolver chaves,
    preços ou URLs; apenas `provider`/`id`/metadados públicos.
  - **Política de custo contornada** por ID preferido. Mitigação: `assertZeroCostRequest` continua
    aplicado por tentativa (já é o estado atual) + teste com preferido inválido/pago → rejeitado.
- **Como validar.** `test/auto-free-provider.test.js` (novo): reordenação por preferência, fallback
  após falha do preferido, candidato pago/inválido bloqueado, continuidade entre dois candidatos;
  teste da rota `/api/models` (sem segredos, inclui apenas configurados); `npm run test:llm`
  (opt-in, apenas modelos explicitamente gratuitos) como verificação real quando credenciais
  existirem; conferência de nomes em `.env.example`.
- **Critério objetivo de conclusão.** Preferência funcional e persistida; failover intacto; modelo
  efetivo visível sem `?debug=1`; zero segredos em qualquer resposta; continuidade de contexto
  comprovada por teste.

### F6 — Gestão de contexto e janela de tokens

- **Objetivo.** Impedir que o contexto enviado exceda a janela do modelo que será tentado, **sem
  destruir o contexto operacional**.
- **Problema atual.** A3.12: corte fixo (2 transmissões / 2.000 chars) igual para qualquer modelo;
  nenhuma reserva para a resposta; nenhum uso da janela real; nenhum sinal de que um candidato foi
  pulado por tamanho.
- **Comportamento final desejado.** O sistema estima o tamanho do payload, reserva espaço para a
  resposta, ajusta o contexto dinamicamente, pula candidatos que não comportam o payload
  registrando o motivo (`context_budget_exceeded`) e, se nenhum comportar, falha de forma explícita
  de provider — **nunca** como "documento ausente".
- **Componentes envolvidos.** `src/llm/semantic-interpreter.js` (`limitedSessionContext`),
  `src/llm/auto-free-provider.js`, `src/llm/openrouter-provider.js` (cache do catálogo),
  `server/model-registry.js`, `server/interpret-transmission.js`, `pipeline.js` (diagnóstico).
- **Arquivos/módulos afetados (prováveis).** novo `src/llm/context-budget.js`
  (`estimateTokens`, `contextLengthFor(candidate)`, `trimSessionContext(context, budget)`);
  `openrouter-provider.js` (expor `context_length` do catálogo já validado por
  `verifyFreeModel`); `auto-free-provider.js` (pular candidato sem espaço, nova falha);
  `semantic-interpreter.js` (substituir o corte fixo pelo orçamento); testes novos.
- **Dependências.** F5 (ordem de execução) e F0. Reaproveita o catálogo já consultado na validação
  gratuita — não faz chamada extra.
- **Alterações arquiteturais necessárias.**
  1. Orçamento **por candidato**, obtido do catálogo vivo (C4), com fallback conservador quando o
     metadado faltar — e nunca um número inventado.
  2. Política de corte com invariantes protegidos: identidade da aeronave, aeródromo, fase,
     frequência, última autorização, autorização pendente, pergunta pendente e situação de
     emergência **não** são cortados; o corte começa pelo histórico antigo e por strings longas.
  3. Registro do orçamento no diagnóstico (tokens estimados, reserva, decisão de corte) para
     auditoria em `?debug=1`.
  4. Falha explícita e distinta (`context_budget_exceeded`) quando nenhum candidato comporta o
     payload.
- **Riscos.**
  - **Corte agressivo apagar contexto operacional** e degradar a interpretação. Mitigação: lista
    de invariantes + teste que verifica que o contexto cortado ainda contém todos eles.
  - **Heurística de tokens imprecisa.** Mitigação: documentar a heurística e manter margem de
    segurança; nunca ter como objetivo "usar a janela inteira".
  - **`context_length` ausente/0 no catálogo** para algum candidato. Mitigação: tratar como
    "desconhecido" e usar o menor orçamento entre os conhecidos, nunca o maior.
- **Como validar.** Testes de `trimSessionContext` (invariantes preservados; história reduzida por
  último; orçamento menor → corte maior); teste do provider pulando candidato por orçamento e
  seguindo para o próximo; teste de falha explícita quando todos são pequenos; verificação do
  diagnóstico.
- **Critério objetivo de conclusão.** Nenhum corte fixo de mensagens/chars em `src/`; todo
  candidato tentado teve seu orçamento verificado antes da chamada; `context_budget_exceeded`
  observável no diagnóstico; estado/histórico relevante preservados em todos os casos de corte.

### F7 — Unificação da interface e descontinuação da paralela

- **Objetivo.** Uma única arquitetura oficial de aplicação, incorporando o que tinha valor na
  implementação paralela e removendo a divergência.
- **Problema atual.** A3.13 + decisão D1: duas aplicações, dois caminhos de LLM, dois conjuntos de
  estados de PTT, dois conjuntos de CSS.
- **Comportamento final desejado.** A aplicação oficial é uma só: `index.html` + `web/app.js` sobre
  o pipeline documental, com os recursos úteis portados. `voice.html` e o caminho sem grounding
  deixam de existir.
- **Componentes envolvidos.** `index.html`, `web/app.js`, `web/styles.css`, `voice.html`,
  `src/App.jsx`, `src/main.jsx`, `src/styles.css`, `src/services/generateReply.js`,
  `server/providers.js`, `server/generate-reply.js`, `api/generate-reply.js`, `vite.config.js`,
  `public/radio-mark.svg`, `README.md`, `docs/*`.
- **Arquivos/módulos afetados (prováveis).** remoção dos arquivos do caminho paralelo; `vite.config.js`
  (uma entrada, plugin React removido se não houver mais JSX); `package.json`
  (`react`, `react-dom`, `@vitejs/plugin-react` saem se nada mais usar JSX); `index.html` (link
  "VOICE LAB" removido, indicador de suporte a Web Speech, UI de canal do F4, seletor de modelo do F5);
  `web/styles.css` (absorver o que for aproveitado de `src/styles.css`); `README.md` (arquitetura,
  comandos, implantação — remover menções a `/voice.html`); `docs/ADR-001-LLM-FIRST.md` (alinhar a
  redação com ADR-002); nova ADR-003 referenciada.
- **Dependências.** F1 (a interface oficial passa a consumir o orquestrador extraído), F4 (canal de
  rádio), F5 (seletor/indicador), F6. **Depende de D1** (resolvida: Opção A).
- **Alterações arquiteturais necessárias.**
  1. Portar explicitamente, item por item do inventário do F0: alternância/indicação de idioma,
     aviso visível de suporte a Web Speech e degradação para texto, indicadores de canal,
     `onPointerLeave` (coberto por F4) e orçamento de histórico (substituído por F6). Cada item do
     inventário recebe decisão escrita: **portado** ou **descartado com motivo**.
  2. Remover o caminho `/api/generate-reply` e sua cadeia de provider sem grounding.
  3. Garantir que a única entrada de build seja o simulador documental, com verificação de que
     nenhum arquivo removido é referenciado (`grep` de `voice.html`, `App.jsx`, `generate-reply`,
     `radio-mark`).
- **Riscos.**
  - **Perder algum recurso útil sem perceber.** Mitigação: inventário do F0 é a checklist e o
    critério de conclusão exige a decisão escrita por item.
  - **Build quebrado por referência residual.** Mitigação: `npm run build` + busca por referências
    órfãs como parte da validação.
  - **Remoção do React bloquear migração futura.** Não bloqueia: o núcleo é ES modules puros; o
    React pode voltar como camada de apresentação sem retomar o caminho sem grounding.
- **Como validar.** `npm run build` produz uma única entrada e nada quebra; `npm start` serve a
  aplicação; `grep` não encontra referências aos artefatos removidos; checklist do inventário
  completa; verificação humana no navegador dos fluxos de voz e de texto.
- **Critério objetivo de conclusão.** (1) `voice.html` e o caminho `/api/generate-reply` inexistentes;
  (2) `vite.config.js` com uma entrada; (3) zero dependências de React no `package.json`;
  (4) README/ADRs coerentes com a arquitetura única; (5) cada item do inventário com decisão escrita.

### F8 — Auditoria final e validação integrada

- **Objetivo.** Provar que o comportamento final foi alcançado e que nada da política do projeto foi
  violado.
- **Problema atual.** Não se aplica (fase de fechamento). Depende de todas as anteriores.
- **Comportamento final desejado.** Suíte completa verde sob o pipeline real, corpus e índice
  consistentes, nenhum caminho pago ou sem grounding, arquitetura documentada e limitações
  declaradas.
- **Componentes envolvidos.** Todo o repositório, `docs/`, `scripts/`, `package.json`, `.env.example`.
- **Arquivos/módulos afetados (prováveis).** `README.md`; `docs/ADR-001..003`;
  `docs/PLANO-CORRECOES-2026-09.md` (notas de divergência resolvidas A3.4/§A3.5); `docs/PIPELINE_CONTEXTUAL.md`
  (atualizar para a arquitetura nova — hoje descreve o fluxo determinístico pré-LLM);
  `docs/GERACAO_CORPUS.md` (apenas se metadados do corpus mudarem); `package.json` (audit incluindo
  `test:dialogue`).
- **Dependências.** F0–F7.
- **Alterações arquiteturais necessárias.** Nenhuma nova; consolidação documental e de verificação.
- **Riscos.**
  - **Documentação reafirmar coisas que o código não faz mais** (já aconteceu: `PLANO-CORRECOES`
    descrevia `App.jsx` conectado ao `SimulatorSession`, o que não correspondia ao código). Mitigação:
    toda afirmação documental nova precisa ser verificável por um comando/teste.
  - **Regressão tardia por mudança de contexto/orçamento.** Mitigação: matriz do F3 executada após
    F5/F6, não apenas depois de F1/F2.
- **Como validar.** `npm test`, `npm run test:dialogue`, `npm run test:stt`, `npm run validate`,
  `npm run audit:corpus`, `npm run build` e `npm run audit` completos; `npm run test:llm` quando
  houver credenciais (opt-in); busca por termos proibidos (`gemini`, `paid`, modelos sem `:free`,
  `groq` sem `GROQ_FREE_TIER_CONFIRMED`); conferência de `.env.example`; checklist humano no
  navegador (Chrome/Edge, HTTPS, permissão de microfone, PTT, resposta falada, bloqueio em
  `recebendo`).
- **Critério objetivo de conclusão.** (1) `npm run audit` verde, incluindo `test:dialogue`;
  (2) nenhum provider/modelo pago ou não validado alcançável; (3) todos os itens A3.1–A3.13 com
  estado final explícito (resolvido / descartado com motivo / ainda pendente com justificativa);
  (4) limitações declaradas (PDFs de origem ausentes, ausência de validação pedagógica por
  instrutor, microfone físico dependente de teste humano) mantidas visíveis no README;
  (5) decisão registrada sobre `docs/PLANO_REF.md` e o worktree `.kilo/worktrees/fossil-network`.

---

## F. Grafo de dependências entre fases

```text
F0 (auditoria + baseline de caracterização)
 ├─→ F1 (conhecimento/diálogo/decisão/realização)
 │    ├─→ F2 (estado/autorização pendente/cotejamento)
 │    │    └─→ F3 (matriz normativa de diálogo)
 │    └─→ F7 (unificação da interface)
 ├─→ F4 (PTT e estados de rádio)            [paralelizável com F1/F3; conflita com F2 em web/app.js]
 ├─→ F5 (modelos: preferência/visibilidade) [paralelizável; antes de F6]
 │    └─→ F6 (orçamento de contexto)
 └───────────────────────────────────────────→ F8 (auditoria integrada)
```

Dependências duras:

- F1 define o contrato de decisão/taxonomia que F3 afirma.
- F2 define o formato de `autorizacao_pendente` antes de F3 ser escrita.
- F5 e F6 mexem no mesmo módulo (`auto-free-provider.js`) — manter a ordem F5→F6.
- F7 depende de F1/F4/F5/F6 e da decisão D1.
- F8 depende de todas e deve rodar a matriz do F3 **depois** de F5/F6.

Paralelização segura: F4 pode correr em paralelo a F1/F3 por não tocar a inteligência — mas **não**
em paralelo a F2, porque ambos editam `web/app.js`. F1 e F2 tocam arquivos em comum
(`controller.js`/`decision.js`, `state-machine.js`) e devem ser sequenciais.

---

## G. Critérios de validação por fase (consolidado)

| Fase | Comando(s) de validação | Prova adicional exigida |
|---|---|---|
| F0 | `npm test`, `npm run audit`, `npm run test:dialogue-baseline` | Baseline determinística (duas execuções → mesmo resultado); inventário do `App.jsx` com decisão por item. |
| F1 | `npm test`, novo teste de taxonomia/preempção | §7: caso atípico citando artigo diferente do típico; §5: comunicação incompatível não vira pedido novo; §10: nenhuma resposta sem fonte. |
| F2 | `npm test`, teste de cotejamento por pendente | Táxi com pista sem QNH = correto; divergente → "negativo" + versão correta (art. 12 § 1º); readback em `aproximacao`/`emergencia`. |
| F3 | `npm run test:dialogue`, `npm run validate`, `npm run audit` | Falha deliberada em um turno intermediário detectada; validador rejeita fonte/justificativa inválida. |
| F4 | `npm run test` + teste de canal | Soltar fora do botão encerra; `recebendo` bloqueia; `onEnd`/`onError` devolvem a `livre`; atalho de teclado preservado. |
| F5 | `npm test`, teste da rota `/api/models` | Preferido falha → próximo responde; contexto idêntico entre dois candidatos; nenhuma chave exposta. |
| F6 | `npm test` | Invariantes de contexto preservados no corte; candidato pulado por orçamento; falha explícita quando todos são pequenos. |
| F7 | `npm run build`, `npm start`, `grep` de referências órfãs | Checklist do inventário completa; uma entrada de build. |
| F8 | `npm run audit`, `npm run test:stt`, `npm run build` | Busca por caminhos pagos/sem grounding; checklist humano no navegador; limitações atualizadas. |

---

## H. Estratégia de testes de diálogo

**Três camadas distintas, sem misturar papéis:**

1. **Baseline de caracterização (F0, não-normativa).** Snapshot do comportamento atual em roteiros
   multi-turno, executado sobre o pipeline real. Serve para **detectar mudança**, não para definir
   correção. Regenerável apenas por script dedicado; divergências conhecidas ficam marcadas com o
   `id` do achado (A3.n). É descartável ao final do F3.
2. **Matriz de regressão (F3, normativa).** `reference/dialogue-regression-matrix.json` versionada,
   validada estaticamente antes de rodar. Cada turno tem `piloto`, `espera` (intenção, status,
   fontes, fase, frequência, classificação de cotejamento, pendências) e uma **justificativa
   documental** (artigo/chunk) sem a qual a validação estática falha. É a rede que protege F4–F7.
3. **Testes unitários por módulo.** `dialogue.js`, `knowledge.js`, `decision.js`, `phraseology.js`,
   `readback.js`, `ptt-state.js`, `context-budget.js`. Cada um testado isoladamente, com o pipeline
   real nos testes de integração.

**Regras invariantes da estratégia:**

- Nenhum teste roda contra um caminho alternativo: todos usam `processTransmission` +
  `applyStateUpdate` + `recordTransmission`, os mesmos módulos do navegador (§13).
- O estado evolui entre turnos (nunca recriado por turno) nos testes de diálogo.
- A matriz não inventa procedimento: se não há base no corpus para esperar um comportamento, o caso
  declara `no_documentary_coverage` ou `external_source_unavailable`.
- Ao final do F3, a baseline do F0 é removida do fluxo normal (ficando apenas como registro
  histórico no documento) para não criar duas fontes de expectativa.
- Microfone físico, vozes instaladas e qualidade de áudio permanecem sujeitos a verificação humana
  (nem F4 nem F8 os automatizam).

---

## I. Riscos e pontos de atenção

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| I1 | Refatorar conhecimento/decisão sem rede multi-turno | Alto | Harness de caracterização no F0 (D2) + matriz normativa no F3. |
| I2 | "Resolver" o teste em vez de seguir a documentação (§14) | Alto | Validador estático da matriz + justificativa documental obrigatória + revisão do que a matriz afirma. |
| I3 | Introduzir procedimento não documentado para cobrir casos novos | Alto | Invariante "nenhuma decisão/realização sem fonte recuperada"; proibição de lista de frases como fonte. |
| I4 | Perder recall ao trocar ID fixo por predicado | Médio | Suíte atual como não-regressão imediata; casos held-out existentes; baseline sinaliza mudança. |
| I5 | A3.7 exigir mudança de metadados do corpus | Médio | Alteração só via `docs/GERACAO_CORPUS.md` (nunca um JSON só); se a escolha for ampliar `PHASES`, justificar e testar; alternativa é camada de definições fora do BM25 de fase. |
| I6 | A3.8 quebrar readback em aproximação/emergência | Médio | Teste dedicado por fase + não remover a forçagem sem substituto explícito. |
| I7 | Ambiguidade real do art. 12 III × art. 45 III (QNH e itens ausentes no art. 45) | Médio | Decidir com os dois artigos citados, registrar a divergência no código e cobrir com testes de táxi e de reajuste de altímetro. |
| I8 | TTS travar o canal em `recebendo` | Médio | Timeout de segurança + teste do caminho de erro. |
| I9 | Preferência de modelo eliminar o failover | Médio | Reordenar (nunca filtrar) + teste de falha do preferido. |
| I10 | Orçamento de contexto apagar estado operacional | Médio | Lista de invariantes + teste do contexto cortado. |
| I11 | `context_length` ausente no catálogo | Baixo | Tratar como desconhecido e adotar o menor orçamento conhecido. |
| I12 | Documentação voltar a divergir do código | Médio | Afirmação documental precisa de comando/teste verificável (F8); já houve divergência registrada em A.5/§A3.5. |
| I13 | Custo zero contornado por rota nova | Alto | `cost-policy.js` permanece barreira por tentativa; teste com candidato pago/inválido; busca por termos proibidos no F8. |
| I14 | Escopo da realização linguística crescer indefinidamente | Médio | Crescer por demanda da matriz do F3, sempre citando chunk; proibida geração livre. |
| I15 | Perda de recurso útil do `App.jsx` na descontinuação | Baixo | Inventário no F0 + decisão escrita por item no F7. |
| I16 | Corpus/índice inconsistentes por edição manual | Alto | Só `python3 scripts/generate_corpus.py`; `npm run check:index` e `npm run audit:corpus` como gate. |

---

## J. Sequência recomendada de execução

1. **F0** — auditoria, inventário e baseline. Sem tocar produção. Gate: `npm run audit` verde +
   baseline determinística.
2. **F1** — conhecimento, interpretação contextual, diálogo, decisão e realização. É a fase de maior
   risco e maior valor; consome toda a análise de A.3.
3. **F2** — autorização pendente e cotejamento com base no art. 5º/12/45.
4. **F3** — matriz normativa de diálogo, já sobre o formato novo.
5. **F4** — PTT e estados de rádio. Pode começar em paralelo a F1/F3 se houver mais de um agente,
   **mas não a F2**: ambos editam `web/app.js` (F2 na chamada de avaliação de cotejamento, F4 na
   máquina de estados e nos listeners). Ordem segura: F1 → F2 → F4, ou F4 → F2 se o F4 começar primeiro.
6. **F5** — preferência, visibilidade e continuidade de modelos gratuitos.
7. **F6** — orçamento de contexto derivado do catálogo vivo.
8. **F7** — unificação da interface, portando o inventário e descontinuando a paralela.
9. **F8** — auditoria integrada, matriz reexecutada, documentação, higiene do repositório.

**Ordens alternativas que NÃO devem ser adotadas:** mover F3 para antes de F2 (a matriz seria escrita
sobre um formato de cotejamento que vai mudar); executar F6 antes de F5 (reescreve duas vezes o mesmo
laço de candidatos); executar F7 antes de F1/F4/F5/F6 (perde-se a chance de portar recursos já
prontos e refaz-se trabalho de interface); executar F8 sem reexecutar F3 após F5/F6.

**Paralelização:** F4 em paralelo a F1/F3; nada mais em paralelo (F1/F2 compartilham módulos;
F2 e F4 compartilham `web/app.js`; F5/F6 compartilham módulo; F7 depende de todos).

**Gates inegociáveis a cada fase:** suíte completa verde; nenhuma resposta/decision sem fonte
recuperada; nenhum provider/modelo pago; nenhuma regra nova sem citação documental; divergência entre
teste e documentação registrada, nunca "corrigida" no código.

---

## Anexo 1 — Mapa de arquivos por fase

| Fase | Principais arquivos/módulos |
|---|---|
| F0 | `reference/dialogue-inventory.v1.json` (novo), `reference/dialogue-baseline.v1.json` (novo), `scripts/update-dialogue-baseline.mjs` (novo), `test/dialogue-baseline.test.js` (novo), `docs/INVENTARIO-APP-JSX.md` (novo), `package.json` |
| F1 | `src/dialogue.js` (novo), `src/knowledge.js` (novo), `src/knowledge/evidence-rules.js` (novo), `src/decision.js` (novo), `src/phraseology.js` (novo), `src/controller.js`, `src/retrieval.js`, `src/state-machine.js`, `src/pipeline.js`, `src/llm/semantic-interpreter.js`, `docs/ADR-003-DIALOGO-E-EVIDENCIA.md` (novo) |
| F2 | `src/readback-rules.js` (novo), `src/readback.js` (novo), `src/state-machine.js`, `src/training.js`, `web/app.js`, testes de controlador/pipeline |
| F3 | `reference/dialogue-regression-matrix.json` (novo), `scripts/validate-dialogue-matrix.mjs` (novo), `test/dialogue-regression.test.js` (novo), `package.json`, `README.md` |
| F4 | `src/ptt-state.js` (novo), `web/app.js`, `index.html`, `web/styles.css`, `test/ptt-state.test.js` (novo), `test/ptt-flow.test.js` (novo, se necessário) |
| F5 | `server/models.js` (novo), `api/models.js` (novo), `src/llm/auto-free-provider.js`, `server/interpret-transmission.js`, `web/app.js`, `index.html`, `vite.config.js`, `test/auto-free-provider.test.js` (novo) |
| F6 | `src/llm/context-budget.js` (novo), `src/llm/openrouter-provider.js`, `src/llm/auto-free-provider.js`, `src/llm/semantic-interpreter.js` |
| F7 | `voice.html`, `src/App.jsx`, `src/main.jsx`, `src/styles.css`, `src/services/generateReply.js`, `server/providers.js`, `server/generate-reply.js`, `api/generate-reply.js`, `public/radio-mark.svg`, `vite.config.js`, `package.json`, `README.md`, `index.html` |
| F8 | `README.md`, `docs/ADR-001-LLM-FIRST.md`, `docs/PIPELINE_CONTEXTUAL.md`, `docs/PLANO-CORRECOES-2026-09.md`, `package.json` |

## Anexo 2 — Estado final esperado, item por item do §25

| Requisito do §25 | Como fica comprovado |
|---|---|
| O usuário pode se expressar de maneiras diferentes | Interpretação LLM-first + teste held-out existente + predicado documental em vez de frase. |
| O sistema compreende comunicações operacionalmente inteligíveis | F1: interpretação → decisão, com `missingOperationalInformation`/`uncertainElements` consumidos. |
| O sistema mantém o contexto da conversa | `pergunta_pendente` + `autorizacao_pendente` no estado validado (F1/F2). |
| O sistema sabe quando precisa perguntar | Taxonomia de cobertura + pergunta pendente (F1). |
| Reconhece resposta que não responde à pergunta anterior | Precedência de diálogo do F1 + caso (d) da matriz do F3. |
| Lida com situações incompletas | §8: emergência com informação crítica faltante → esclarecimento → atualização (F1/F3 caso g). |
| Continua sequências de diálogo | Matriz multi-turno (F3) sobre o pipeline real. |
| Usa conhecimento documental aplicável | Predicado documental multi-fonte com citação (F1); §7 demonstrado. |
| Lida com situações normais e atípicas | Caso atípico citando artigo diferente do típico (F1, critério 3). |
| Não depende de uma única resposta por situação | `replies` fixo removido; realização a partir de elementos e padronagem (F1). |
| Não inventa procedimentos | Invariante de fonte obrigatória + ausência de tabelas de frases como autoridade (F1/F8). |
| Estado operacional controlado pela aplicação | `applyStateUpdate` com listas fechadas (já existente, ampliado em F1/F2). |
| Modelos gratuitos substituíveis sem perder a sessão | F5 (reordenação + continuidade) e F6 (orçamento). |
| Voz é apenas entrada/saída | F4 (canal) e C6 (nenhuma mudança de provider de voz). |
| Preparado para fontes externas | Status `external_source_unavailable` distinto (C5/F1). |
