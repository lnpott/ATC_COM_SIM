# Roadmap de execução da refatoração — ATC_COM_SIM

Documento de **acompanhamento**. Ele não substitui o plano: `docs/REFATOR_DEEP.md` define *o que* deve
ser feito, *por quê* e *como* em cada fase; este arquivo registra *onde estamos agora* — o que já foi
executado, com qual evidência, o que está em andamento e qual é o próximo passo.

- Última atualização: 22/09/2026
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
| F1 | Conhecimento, interpretação contextual, diálogo e decisão | **Em andamento** | ADR-003 e módulos `knowledge`/`dialogue`/`decision`/`phraseology` |
| F2 | Estado operacional, autorização pendente e cotejamento | Pendente | — |
| F3 | Matriz normativa de regressão de diálogo | Pendente | — |
| F4 | PTT e estados de rádio | Pendente | — |
| F5 | Modelos gratuitos: preferência, visibilidade e continuidade | Pendente | — |
| F6 | Gestão de contexto e janela de tokens | Pendente | — |
| F7 | Unificação da interface e descontinuação da paralela | Pendente | — |
| F8 | Auditoria final e validação integrada | Pendente | — |

Legenda: **Concluída** · **Em andamento** · **Pendente** · **Bloqueada** (com motivo registrado).

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

## Registro de divergências (A3.x)

| ID | Divergência | Status |
|---|---|---|
| A3.1 | Intents que o LLM produz caem em falso "sem cobertura documental" | Aberta (F1) |
| A3.2 | `missingOperationalInformation` e `uncertainElements` do LLM são descartados | Aberta (F1) |
| A3.3 | Um intent → um artigo fixo impede §7/§8 (fogo nunca cita o art. 66) | Aberta (F1) |
| A3.4 | Dois avaliadores de cotejamento divergentes; art. 12 §1º/§2º não implementados | Aberta (F2) |
| A3.5 | PLANO-CORRECOES aponta ICA 100-12, que não tem provisão de cotejamento | Registrada |
| A3.6 | O diálogo não é estado (sem pergunta pendente) | Aberta (F1) |
| A3.7 | `artigo-0005` e `artigo-0018` são inalcançáveis: `fases: ["coordenacao"]` fora de `PHASES` | Aberta (F1) |
| A3.8 | Recuperação depende da fase forçada em `PROFILES` (art. 12 só é alcançável por isso) | Aberta (F1) |
| A3.9 | TTS mudo em esclarecimento e recusa | Aberta (F7) |
| A3.10 | Rótulo do PTT expõe estágios internos do pipeline | Aberta (F4) |
| A3.11 | Fallback de modelo invisível, sem preferência e sem rota de catálogo | Aberta (F5) |
| A3.12 | Orçamento de contexto fixo (2 transmissões / 2.000 chars) | Aberta (F6) |
| A3.13 | Duas arquiteturas de aplicação independentes | Aberta (F7) |
| A3.14 | Cotejamento sem fonte citável em inglês | **Resolvida** (`145f7c7`) |
| A3.15 | Cotejamento reclassificado como solicitação nova | Aberta (F1/F2) |
| A3.16 | Ambiguidade criada pelo próprio parser depois de uma autorização | Aberta (F1) |
| A3.17 | Autorização emitida sem transição de estado válida | Aberta (F2) |

## Hipóteses que o plano assumia e a execução precisa revisar

| Hipótese do plano | Situação atual |
|---|---|
| Taxonomia com `no_documentary_coverage` | Em revisão no F1: o nome afirma ausência de cobertura no manual, que é exatamente a causa-raiz de A3.1. A execução separa "nenhuma base recuperada" de "cobertura documental inexistente" por **código de motivo**, e a fala nunca afirma ausência sem prova. |
| Lista de cotejamento de `docs/PLANO-CORRECOES-2026-09.md` viria do ICA 100-12 | Resolvido: a base é MCA 100-16 art. 5º/12/45 (ver A3.5). |
| `server/auto-free-provider.js` | O módulo real é `src/llm/auto-free-provider.js`. Corrigido no plano. |

## Pendências de verificação (não bloqueiam a execução)

- `.env.example` não pôde ser lido pela ferramenta de leitura; o F5 deve confirmar os nomes das
  variáveis de candidatos e de política de custo.
- Os PDFs de origem não estão no repositório: a reconciliação do corpus com os documentos originais
  continua pendente (registrado em `docs/PIPELINE_CONTEXTUAL.md` e no §9.1 de `atc-simulator-plano.md`).
- Worktree órfão `.kilo/worktrees/fossil-network` no mesmo commit — decidir no F8.
- Validação pedagógica do cotejamento com instrutor permanece humana (F8).

## Próximo passo

**F1 — conhecimento, interpretação contextual, diálogo e decisão.** Critérios objetivos de conclusão
(§E do plano): zero mapa `intent → único artigo fixo`; `missingOperationalInformation` comprovadamente
consumido; §7 demonstrável (caso atípico citando artigo diferente do típico); §5 demonstrável
(comunicação incompatível não vira solicitação nova); toda decisão com ≥1 fonte recuperada; ADR-003
publicada.
