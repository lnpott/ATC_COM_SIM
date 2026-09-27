# ADR-003 — Diálogo com memória e evidência descoberta por predicado documental

Status: **aceito** (Fase F1 de `docs/REFATOR_DEEP.md`).

Relacionadas: [ADR-001](ADR-001-LLM-FIRST.md) (a interpretação continua LLM-first),
[ADR-002](ADR-002-ZERO-COST.md) (custo zero e o LLM nunca autoriza).

## Problema

O pipeline anterior tinha a interpretação LLM-first, mas **a decisão e o texto falado eram
um catálogo fixo** em `src/controller.js`: um mapa `intent → único artigo` (`SOURCE_BY_INTENT`),
nove frases por idioma e nove atualizações de estado. O grounding funcionava como portão —
"o artigo previamente escolhido apareceu no top-8?" — e não como descoberta. Consequências
medidas em `docs/REFATOR_DEEP.md` §A.3:

- **A3.1** intenções que o LLM produz (`position_report`, `unable`, `go_around`…) caíam em falso
  "sem cobertura documental" porque não havia entrada no mapa;
- **A3.2** `missingOperationalInformation` e `uncertainElements`, o sinal mais rico da
  interpretação, eram descartados;
- **A3.3** "fogo" só podia citar o art. 64 (motor) — o art. 66 (fogo e fumaça a bordo) era
  estruturalmente inalcançável;
- **A3.6** o diálogo não era estado: `needs_clarification` devolvia `stateUpdate: null`, o turno
  seguinte era interpretado do zero e §5/§8 do PLANO_REF eram impossíveis;
- **A3.7/A3.8** a recuperação dependia de metadados de fase e de uma forçagem oculta.

## Decisão

1. **A evidência passa a ser descoberta, não escolhida.** A fonte esperada deixa de ser um ID
   fixo e passa a ser um **predicado documental**: cada família de intenção declara uma ou mais
   *variantes documentadas* em `src/knowledge/evidence-rules.js`, e a comunicação escolhe a
   variante pelos termos que contém. Cada variante cita o artigo que a fundamenta. Uma decisão
   pode citar 1..N fontes (art. 66 + art. 43 para fogo a bordo, por exemplo) e **só cita ID que o
   BM25 realmente recuperou** — a regra de ouro continua intacta em `src/grounding.js`.
2. **Decisão e realização são etapas separadas.** `src/knowledge.js` resolve a *cobertura*
   (`documented`, `needs_clarification`, `session_context_missing`, `external_source_unavailable`,
   `coverage_insufficient`, `not_understood`) e `src/phraseology.js` realiza a fala a partir de
   **elementos tipados** (`instrucao` | `informacao` | `pergunta`), cada realização com citação
   documental. `compose()` lança se um elemento de instrução não tiver fonte.
3. **O diálogo é estado da sessão.** Uma pergunta do controlador vira `contexto.pergunta_pendente`
   (`src/dialogue.js`), campo da lista fechada de `applyStateUpdate`. O turno seguinte é
   confrontado primeiro com essa expectativa: resposta à pergunta, nova solicitação documentada ou
   comunicação incompatível (que **não** vira pedido novo — o controlador permanece no contexto e
   reformula, §5).
4. **O contexto resolve a ambiguidade do léxico.** Quando existe autorização a cotejar e a fala
   traz marcador documentado de cotejamento (art. 39: COTEJE / READ BACK), a comunicação é
   resolvida como cotejamento **antes** da recuperação, e a busca é a do cotejamento — não a do
   léxico que empatou (A3.15/A3.16).
5. **O LLM continua sem autoridade.** Os sinais da interpretação são **entradas** da decisão, como
   prevê o §4 do PLANO_REF: a pergunta feita ao piloto precisa ter base documental (requisito da
   variante + vocabulário do art. 39 CONFIRME), e nenhuma regra nova entra sem citação. O que o
   simulador ainda não trata é declarado como limitação do simulador
   (`coverage_insufficient`/`family-not-implemented`), **nunca** como ausência no manual.

## Consequências

- Deixou de existir qualquer mapa `intent → artigo fixo` em `src/`: o papel que restou ao léxico
  determinístico é só reconhecer termos (`LEGACY_TERMS` em `src/controller.js`, sem artigo).
- Casos atípicos por composição passam a funcionar: emergência → informação crítica faltante →
  esclarecimento registrado em estado → resposta do piloto → recuperação → decisão com fonte.
- Crescer a cobertura passou a ser **adicionar variante citando chunk**, nunca adicionar frase
  solta ou "melhorar o prompt" para compensar dívida do lado determinístico.
- O custo da mudança é a manutenção da tabela de variantes e da matriz normativa
  (`reference/dialogue-regression-matrix.json`), que é justamente o contrato do produto.
- Limitação declarada: uma família sem variante documentada produz `coverage_insufficient` com o
  motivo `family-not-implemented`; ela não é uma recusa por ausência de cobertura no corpus.

## Verificação

- `test/coverage-taxonomy.test.js` — taxonomia (§9) e §7: fogo cita art. 66 + art. 43 e motor cita
  art. 64, com fontes realmente recuperadas; informação faltante vira pergunta; dado de sessão é
  distinto de pergunta ao piloto.
- `test/dialogue-state.test.js` — memória do diálogo: resposta à pergunta pendente, comunicação
  incompatível que não vira solicitação nova e retomada do fluxo.
- `test/dialogue-regression.test.js` + `reference/dialogue-regression-matrix.json` — sequências
  multi-turno sobre o pipeline real, um único estado evoluindo turno a turno.
- `npm run audit` verde.
