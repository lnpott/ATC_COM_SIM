# Plano de Correções — Comunicação por Voz, Cotejamento, PTT e Seleção de Modelo

Status: **proposto, aguardando validação de Lucas antes da execução.**
Data: 21/09/2026 · Escopo: cinco problemas reportados sobre o estado atual do repositório `ATC_COM_SIM` (branch `main`).

Este documento segue o formato de briefing de `atc-simulator-plano.md`: qualquer IA ou
desenvolvedor deve conseguir executar a partir daqui sem contexto adicional. Cada seção tem
diagnóstico (com arquivo/função exatos), desenho da solução, tarefas e critério de aceite.

---

## 0. Decisão prévia obrigatória — duas interfaces divergentes

Antes de tocar em qualquer um dos cinco itens, é preciso resolver uma inconsistência estrutural
que os atravessa todos: **o repositório tem duas implementações de voz/PTT/LLM que não
compartilham código nem comportamento.**

| | `index.html` + `web/app.js` (simulador documental) | `voice.html` + `src/App.jsx` (laboratório de voz) |
|---|---|---|
| Pipeline | `processTransmission` → `controller.js` → grounding obrigatório (`src/grounding.js`) | `generateReply` → `/api/generate-reply` → `server/providers.js` (prompt genérico, **sem** RAG, **sem** estado) |
| LLM | `auto-free-provider.js` com fallback multi-modelo (`model-registry.js`) | `groq` fixo ou `mock`, **sem** fallback |
| PTT | `MediaRecorder` + STT em cascata (Groq→local→Web Speech) + estados de pipeline | Só `SpeechRecognition` do navegador, estados `idle/listening/processing/speaking` |
| TTS | `speakTransmission`, mas só quando `reply.covered === true` (bug do item 1) | `speakTransmission` sempre |
| Cotejamento/score | Sim (`training.js`) | Não existe |

A nota de memória de 20/09 registrava que "`App.jsx` conecta `SimulatorSession` ao loop de voz" —
**isso não corresponde ao código atual.** `App.jsx` não importa `SimulatorSession`, `controller.js`
nem `grounding.js`; ele fala com `/api/generate-reply`, que é o endpoint de prova de conceito com o
prompt "não emita autorização real". Ou a correção foi revertida, ou nunca chegou a esse arquivo.
Isso será corrigido na memória do projeto após este plano.

**Recomendação:** os itens 1, 2, 3, 4 e 5 abaixo descrevem, em todos os casos, o pipeline
**documental** (`web/app.js`), porque é o único fundamentado nos manuais — implementar PTT
refinado, seleção de modelo e cotejamento estruturado em cima do `App.jsx` seria construir a
mesma coisa duas vezes, e mantê-las divergentes é a origem mais provável de bugs futuros
"funciona em uma tela e não na outra".

Duas saídas possíveis, a decidir por Lucas antes da Fase 1:

- **(A) Descontinuar `voice.html`/`App.jsx`** nesta entrega (remover do `vite.config.js`/`build.rollupOptions.input`, manter o arquivo fora do build ou apagar) e concentrar tudo em `index.html`. Menor esforço, elimina a divergência de vez.
- **(B) Fazer `App.jsx` consumir os mesmos módulos de `web/app.js`** (extrair a lógica de PTT/estado/LLM para módulos compartilhados em `src/`, e os dois HTMLs viram só apresentação). Mais esforço, mas preserva a UI React caso ela tenha valor próprio (ex.: futura migração de todo o app para React).

Este plano assume **(A)** por padrão nas estimativas de esforço abaixo, por ser reversível e não
bloquear os outros itens. Se Lucas preferir (B), a Fase 4 (PTT) e a Fase 5 (modelo) crescem porque
a extração para módulo compartilhado vira pré-requisito.

---

## 1. TTS também para esclarecimento e recusa

### Diagnóstico

Em `web/app.js`, dentro de `transmit()`:

```js
if (!reply.covered) {
  addMessage('atco', reply.spokenText, reply.status === 'unsupported'); renderEvidence(null); renderScore(); return;
}
// ...
if (voiceEnabled) try { speakTransmission(reply.spokenText, { idioma }); } catch { /* ... */ }
```

O `return` antecipado no bloco `!reply.covered` pula o `speakTransmission`. `reply.covered` é
`false` para `not_understood`, `needs_clarification`, `unsupported` e
`operational_context_missing` (ver `controller.js`, função `outcome()` e os retornos antecipados de
`decideGroundedReply`). Ou seja: hoje, toda vez que o controlador pede esclarecimento ou recusa a
transmissão, a resposta aparece só como texto — quebrando a imersão de fonia e o próprio objetivo
do treino, que é auditivo.

### Desenho da solução

1. Extrair a decisão "isto deve ser falado?" para fora do DOM, como função pura testável — hoje
   não existe nenhum teste automatizado de `web/app.js` porque a lógica está presa a manipulação de
   DOM. Regra: **qualquer `decision`/`reply` com `spokenText` não vazio deve ser falado**,
   independentemente de `covered`. A única exceção legítima de silêncio são falhas de sistema que
   não são fala do controlador (erro de captura de áudio, permissão de microfone negada — essas
   já não vêm de `reply.spokenText`, vêm de mensagens de erro locais no `catch` de `stopPtt()`).
2. Reorganizar `transmit()` para chamar `speakTransmission` uma única vez, depois de
   `addMessage`, para os dois ramos (`covered` e `!covered`), preservando o toggle `voiceEnabled` e
   sem quebrar a atualização de estado/evidência/score que só se aplica ao ramo `covered`.
3. Cobrir o caso de `pointerup` seguido de nova pergunta imediatamente após o esclarecimento:
   como TTS agora vai tocar em mais situações, garantir que `speechSynthesis.cancel()` (já usado em
   `speakTransmission`) segue interrompendo corretamente uma fala anterior se o piloto pressionar o
   PTT de novo antes dela terminar — já existe (`scope.speechSynthesis.cancel?.()` em
   `src/speech.js`), só validar que continua acionado no novo caminho.

### Tarefas

- [ ] Mover a chamada de `speakTransmission` em `web/app.js` para fora do `if (!reply.covered) { ...; return; }`, cobrindo os dois ramos.
- [ ] Ajustar `diagnostics.ttsVoice`/`ttsStartTimeMs` (hoje só preenchidos no ramo `covered`) para também refletir o ramo de esclarecimento/recusa, quando `debug=1`.
- [ ] Adicionar teste (novo arquivo, ex.: `test/tts-coverage.test.js`, sem DOM) que valida que os quatro status não-`documented` (`not_understood`, `needs_clarification`, `unsupported`, `operational_context_missing`) sempre retornam `decision.spokenText` não vazio a partir de `processTransmission` — isso já é garantido pelo `outcome()`, o teste apenas documenta o contrato para não regredir.
- [ ] Teste de integração leve (ver Fase 4, que já vai introduzir jsdom/happy-dom para PTT) confirmando que `speakTransmission` é chamado para os dois ramos.

### Critério de aceite

Pedir "táxi e pouso" ao mesmo tempo (ambíguo) ou uma frase sem cobertura documental deve **tocar
áudio** com o pedido de esclarecimento/recusa, não só exibir texto — verificável manualmente e por
teste automatizado.

---

## 2. Matriz de regressão para diálogo ATC e cotejamento sequencial

### Diagnóstico

A suíte atual (`test/contextual-pipeline.test.js`, `test/heldout-evaluation.test.js`,
`test/controller.test.js`) testa **transmissões isoladas**: uma frase de entrada, uma intenção e
uma fonte esperadas. Há só um teste de dois turnos (`heldout-evaluation.test.js`, "readback usa
autorização da mesma sessão"), sem verificar a sequência completa de um voo nem cotejamentos
sucessivos com classificações diferentes (correto/incompleto/divergente). Não existe hoje nada que
pegue uma regressão em que, por exemplo, a fase muda errado no meio de um voo de 6 turnos mas cada
turno isolado continua "correto" na sua própria pergunta.

### Desenho da solução

1. Criar `reference/dialogue-regression-matrix.json`, no mesmo espírito versionado de
   `reference/search-queries.v1.json`, com roteiros completos por cenário. Cada entrada:

   ```json
   {
     "id": "vfr_local_pt_ciclo_completo",
     "cenario": "vfr_local_pt",
     "idioma": "pt",
     "turnos": [
       { "piloto": "Solo, PT-ABC, solicito táxi", "espera": { "intent": "taxi_request", "status": "documented", "fonte": "MCA-100-16-artigo-0125-001", "fase": "solo", "frequencia": "solo" } },
       { "piloto": "ciente pista 18, QNH 1015", "espera": { "intent": "readback", "status": "documented", "classificacaoCotejamento": "correto" } },
       { "piloto": "Torre, PT-ABC pronto para partida", "espera": { "intent": "takeoff_request", "status": "documented", "fonte": "MCA-100-16-artigo-0126-001", "fase": "decolagem", "frequencia": "torre" } },
       { "piloto": "ciente", "espera": { "intent": "readback", "status": "needs_clarification", "classificacaoCotejamento": "incompleto" } }
     ]
   }
   ```

2. Cobrir no mínimo: (a) ciclo feliz completo solo→decolagem→rota→aproximação→pouso em PT e EN;
   (b) cotejamento correto, incompleto e divergente em pontos diferentes da sequência; (c) emergência
   declarada no meio de um voo em andamento (mudança de fase fora do fluxo linear); (d) pedido
   ambíguo seguido de esclarecimento e depois retomada correta; (e) mudança de frequência (que hoje
   é tratada como autorização do controlador, não dado do piloto — já coberto no
   `contextual-pipeline.test.js`, mas fora de uma sequência real).
3. Criar `test/dialogue-regression.test.js`: para cada entrada da matriz, percorrer os turnos em
   ordem aplicando `processTransmission` + `applyStateUpdate` sobre o **mesmo objeto de estado**
   (não recriar o estado a cada turno, ao contrário dos testes atuais), verificando a cada turno
   `intent`, `status`, `sourceIds`, `fase` e `frequencia` resultantes, e — quando o turno for um
   cotejamento — a classificação (`correto`/`incompleto`/`divergente`) usando o avaliador
   consolidado do item 3.
4. Adicionar script `npm run test:dialogue` e incluir em `npm run audit`, ao lado de `npm test`.

### Tarefas

- [ ] Desenhar o schema JSON da matriz e validar com um pequeno script (`scripts/validate-dialogue-matrix.mjs`, no padrão de `scripts/validate-search.mjs`) que barra `fonte` inexistente no índice ou `intent` desconhecido antes mesmo de rodar os testes.
- [ ] Popular a matriz com pelo menos 6 roteiros (um por cenário versionado em `scenarios.js`, mais variações de cotejamento).
- [ ] Escrever `test/dialogue-regression.test.js`.
- [ ] Adicionar `test:dialogue` ao `package.json` e ao `npm run audit`.

### Critério de aceite

`npm run test:dialogue` falha se qualquer turno de qualquer roteiro divergir do esperado — inclusive
se a causa for uma mudança em outro módulo (ex.: alterar `training.js` sem querer o suficiente para
quebrar o passo 4 do primeiro roteiro).

---

## 3. Autorizações pendentes como objeto estruturado + cotejamento só do que é exigido

### Diagnóstico

Hoje o "pendente" é só um booleano: `state.contexto.cotejamento_pendente` (setado em
`controller.js`, `decideGroundedReply`, sempre `understood.intent !== 'readback'`). A validação em
si vem de **dois avaliadores diferentes e inconsistentes**, ambos em `src/training.js`:

- `evaluateReadback` — usa uma lista fixa e hardcoded de 6 itens (`REQUIRED_READBACK`: pista, QNH,
  nível, proa, frequência, transponder) e verifica por substring se o item aparece no texto da
  autorização e no texto cotejado. É chamado **sempre**, a cada transmissão do piloto, em
  `web/app.js` (`if (lastClearance) evaluations.push(evaluateReadback(...))`) — mesmo quando o
  piloto não estava cotejando nada.
- `evaluateReadbackSemantic` — usado só dentro de `controller.js` quando o intent é `readback`,
  extrai valores por regex tanto da autorização quanto do cotejamento, e considera "exigido" **tudo
  que aparecer na frase falada pelo controlador**.

O problema apontado é concreto: como as respostas de `taxi_request`, `traffic_circuit` e
`vfr_departure` em `controller.js` **sempre** embutem QNH na frase (`"...QNH ${qnh}."`), o segundo
avaliador passa a exigir QNH de volta em todo cotejamento de táxi — sem isso estar necessariamente
determinado pelas Regras do Ar como item de cotejamento obrigatório. "Vento" não aparece em lugar
nenhum do código hoje (não há campo de vento em `scenarios.js`), então o risco ali é preventivo: não
deixar que uma frase informativa (vento, QNH fora do contexto de reajuste de altímetro) vire
cotejamento obrigatório só porque foi mencionada.

### Desenho da solução

1. **Modelar a autorização pendente como objeto**, não booleano. Em `state-machine.js`, o campo de
   contexto `cotejamento_pendente` (boolean) é substituído/complementado por
   `autorizacao_pendente`:

   ```js
   {
     intent: 'taxi_request',
     fonteId: 'MCA-100-16-artigo-0125-001',
     campos: { pista: '18', qnh: '1015' },        // tudo que a autorização carrega
     obrigatorios: ['pista'],                       // só o que exige cotejamento
     informativos: ['qnh'],                         // reportado, não cobrado de volta
   }
   ```

   Isso exige adicionar `autorizacao_pendente` à lista `allowed` de campos de contexto atualizáveis
   em `applyStateUpdate` (`state-machine.js`), e populá-lo em `contextUpdate()`/`decideGroundedReply`
   (`controller.js`) junto com `ultima_autorizacao`.

2. **Tabela de obrigatoriedade por campo, ancorada em fonte documental — não hardcoded por
   suposição.** Antes de implementar, é preciso *confirmar no ICA 100-12* (seção de cotejamento)
   quais itens são efetivamente de cotejamento obrigatório por tipo de autorização — o próprio
   `atc-simulator-plano.md` (seção 11, item 2) já avisa: "não presuma fraseologia de memória". Minha
   leitura do código não substitui essa checagem regulatória, e é exatamente o tipo de suposição que
   a regra de ouro do projeto proíbe fazer sem fonte. Pauta sugerida para a confirmação: pista,
   nível/altitude atribuída, rumo, código de transponder, instrução de espera e autorização de
   entrada em pista costumam ser cotejamento obrigatório; QNH tende a ser informativo exceto quando
   for a própria instrução (reajuste de altímetro); vento é sempre informativo, nunca cotejado. Até
   essa confirmação, a tabela deve ficar isolada em um único arquivo (`src/readback-rules.js`) com
   cada entrada citando o artigo que a embasa, para poder ser corrigida sem tocar em `controller.js`.

3. **Consolidar os dois avaliadores em um só**, alimentado por `autorizacao_pendente` em vez de
   regex sobre texto livre nos dois lados:

   ```js
   export function evaluateReadbackAgainstPending(pendente, textoCotejado) {
     // compara pendente.campos[obrigatorio] contra o que foi extraído do texto cotejado
     // (reaproveita operationalValues() já existente), ignora pendente.informativos
   }
   ```

   `web/app.js` deixa de chamar `evaluateReadback` incondicionalmente a cada turno e passa a chamar
   o avaliador consolidado apenas quando existe `state.contexto.autorizacao_pendente` E a
   interpretação da transmissão atual for `readback` — hoje ele roda mesmo fora desse caso, o que
   também explica pontuações estranhas em `buildSessionReport` quando o piloto fala algo que não é
   cotejamento logo depois de receber uma autorização.

4. **Ciclo de vida do pendente:** ao validar um cotejamento como correto,
   `autorizacao_pendente` é limpo (`null`); se incompleto/divergente, permanece pendente e a
   resposta do controlador pede especificamente os `obrigatorios` que faltaram (já é o
   comportamento de `decideGroundedReply` no ramo `readback`, só precisa trocar a fonte dos dados).

### Tarefas

- [ ] **Bloqueante:** confirmar com Lucas/manual a tabela de campos obrigatórios vs. informativos por tipo de autorização antes de codar `src/readback-rules.js`.
- [ ] Adicionar `autorizacao_pendente` aos campos permitidos de `contexto` em `state-machine.js`.
- [ ] Popular `autorizacao_pendente` em `contextUpdate()`/`decideGroundedReply` (`controller.js`), mantendo `ultima_autorizacao` (texto falado) para a UI/TTS.
- [ ] Criar `src/readback-rules.js` com a tabela citada por artigo.
- [ ] Criar `evaluateReadbackAgainstPending` (pode viver em `training.js`, substituindo `evaluateReadback` e `evaluateReadbackSemantic`) e apagar as duas versões antigas depois de migrar os chamadores.
- [ ] Atualizar `web/app.js` para só avaliar cotejamento quando há `autorizacao_pendente` e a interpretação atual for `readback`.
- [ ] Atualizar `test/controller.test.js`, `test/contextual-pipeline.test.js` e a nova matriz do item 2 para refletir o novo formato.

### Critério de aceite

Um cotejamento de táxi que repete pista mas omite QNH deve ser aceito como correto (QNH vira
informativo); a matriz do item 2 passa a ter casos explícitos cobrindo exatamente isso, para não
regredir silenciosamente.

---

## 4. PTT: apertar/segurar/enviar, com estados Livre e Recebendo

### Diagnóstico

O fluxo de captura em si já está correto em `web/app.js`: `pointerdown` → `startPtt()` (inicia
`MediaRecorder` via `createAudioCaptureSession` + `SpeechRecognition` via `createRecognitionSession`)
→ `pointerup`/`pointercancel` → `stopPtt()` → aguarda os dois em paralelo → `transcribeAudioFree` →
`transmit()`. Ou seja, "apertar, segurar, e o que foi dito é enviado" já é o comportamento real.

Dois problemas concretos:

1. **Falta o listener de `pointerleave`.** `web/app.js` só liga `pointerdown`, `pointerup` e
   `pointercancel` no botão `#ptt`. Se o ponteiro sair da área do botão enquanto pressionado (comum
   em mouse arrastando ou toque impreciso), a gravação nunca é finalizada por essa via — só quando o
   botão de "soltar" for solto em outro lugar da tela, o que em muitos navegadores não dispara
   `pointerup` no elemento original. `App.jsx` (o outro fluxo) já tem `onPointerLeave`, então a
   inconsistência entre os dois é o próprio sintoma do problema descrito.
2. **Os estados expostos no botão são estágios internos do pipeline, não estados de canal de
   rádio.** `setPttState` usa `pttLabels = { recording, transcribing, interpreting, searching,
   responding }` — cinco rótulos de implementação (STT, LLM, busca) aparecem diretamente na UI.
   O pedido é um modelo de dois/três estados que reflete como um canal de rádio real se comporta:
   **Livre** (ninguém transmitindo, PTT disponível), **Transmitindo** (o próprio piloto está com o
   PTT pressionado) e **Recebendo** (canal ocupado pela resposta do controlador — STT, interpretação,
   busca e decisão do lado do piloto já terminaram; da perspectiva de operação de rádio, a frequência
   está ocupada até o TTS terminar de falar).

### Desenho da solução

1. Trocar a fonte de verdade do listener de fim de pressão: em vez de confiar só no `pointerleave`
   do botão (que também tem casos de borda em arrastes rápidos), registrar `pointerup`/`pointercancel`
   no `window`/`document` **apenas enquanto existe uma operação de PTT ativa** (`pttOperation` não
   nulo), e remover o listener ao finalizar. Isso cobre soltar fora do botão, sair da janela com o
   botão ainda pressionado, etc. Manter `pointerleave` no próprio botão como salvaguarda adicional,
   sem custo.
2. Introduzir uma máquina de estados de canal, separada da diagnóstica de pipeline:

   ```js
   // src/ptt-state.js
   export const CHANNEL_STATES = Object.freeze(['livre', 'transmitindo', 'recebendo'])
   ```

   - `livre`: estado inicial e final de cada ciclo; PTT habilitado.
   - `transmitindo`: do `pointerdown` até `stopPtt()` concluir a captura (equivale ao atual
     `recording`); PTT continua fisicamente pressionável (é o próprio piloto segurando).
   - `recebendo`: cobre `transcribing` → `interpreting` → `searching` → `responding` → reprodução do
     TTS, todos colapsados em um único estado do ponto de vista do piloto — a frequência está
     ocupada pela resposta do controlador. PTT **desabilitado** neste estado (half-duplex real: não
     dá para transmitir enquanto o controlador está respondendo).
   - Volta a `livre` só quando `speakTransmission` completa (`onEnd`) ou falha (`onError`), não
     quando o texto aparece — hoje o `finally` de `transmit()` não espera o fim da fala.
3. Manter os estágios finos de pipeline (`recording/transcribing/...`) só como metadado de
   diagnóstico (`window.__ATC_DEBUG__`, `?debug=1`), sem vazar para o rótulo visível do botão.
4. Preservar o atalho de acessibilidade por teclado (`event.detail === 0` alterna start/stop) — ele
   deve continuar funcionando com a nova máquina de estados; documentar isso em teste para não ser
   removido sem querer numa refatoração futura.

### Tarefas

- [ ] Extrair `src/ptt-state.js` com a máquina de três estados (função pura ou pequena classe, testável sem DOM).
- [ ] Mover a captura de fim de pressão para `window`, escopada à duração da operação ativa.
- [ ] Reescrever `setPttState`/render do botão em `web/app.js` para usar `CHANNEL_STATES`, com o mapeamento interno `recording→transmitindo`, `{transcribing,interpreting,searching,responding}→recebendo`.
- [ ] Desabilitar `#ptt` (atributo `disabled` ou bloqueio equivalente) durante `recebendo`.
- [ ] Fazer `recebendo→livre` esperar o `onEnd`/`onError` de `speakTransmission`, não o fim de `transmit()`.
- [ ] Introduzir jsdom ou happy-dom como devDependency para testar `web/app.js` (hoje sem cobertura nenhuma) e escrever `test/ptt-flow.test.js` cobrindo: pointerdown→pointerup dentro do botão; pointerdown→pointerleave; pointerdown→pointerup fora do botão (via `window`); botão desabilitado durante `recebendo`; atalho de teclado.

### Critério de aceite

Segurar o PTT, arrastar o ponteiro para fora do botão e soltar em qualquer lugar da tela encerra a
gravação corretamente. O botão mostra só `Livre`/`Transmitindo`/`Recebendo` e fica inutilizável
durante `Recebendo`, voltando a `Livre` só depois que o áudio de resposta terminar de tocar.

---

## 5. Seleção de modelo, consciência de contexto/token e failover visível

### Diagnóstico

O failover automático **já existe**, mas só no caminho documental: `auto-free-provider.js` percorre
`configuredCandidates(env)` (`server/model-registry.js`) em ordem, captura erro por candidato e
tenta o próximo (`fallbackDepth` cresce a cada tentativa), até esgotar a lista. Isso já cobre
literalmente "se o modelo 1 falhar, muda para o outro" — para `/api/interpret-transmission`. O que
falta:

1. **Nenhuma seleção do usuário.** A ordem é só via variáveis de ambiente do servidor
   (`OPENROUTER_FREE_PRIMARY`, `..._SECONDARY`, etc., em `.env.example`) — o piloto/usuário não
   escolhe nada em tempo de uso.
2. **O modelo ativo é invisível fora do modo debug.** `pipeline.js` já calcula
   `diagnostics.llmProvider`, `requestedModel`, `actualModel` e `fallbackDepth` a cada transmissão —
   essa informação só é exposta em `window.__ATC_DEBUG__` quando a URL tem `?debug=1`. Sem debug, o
   usuário não sabe qual modelo respondeu nem se houve fallback.
3. **`/api/generate-reply` (`server/providers.js`) não tem fallback nenhum** — providers `groq`/`mock`
   fixos, sem lista de candidatos. Isso só importa se a Decisão 0 optar por manter `voice.html`; se
   for descontinuado, este ponto desaparece junto.
4. **Não existe noção de orçamento de tokens.** `limitedSessionContext` (`semantic-interpreter.js`)
   corta o histórico para as 2 últimas transmissões e a transcrição para 2000 caracteres — limites
   fixos, iguais para qualquer modelo, não proporcionais à janela de contexto real de cada candidato
   (que varia: modelos `:free` do OpenRouter têm janelas bem diferentes entre si).

### Desenho da solução

1. **Seletor de preferência, não substituto do fallback.** Adicionar no cabeçalho de `index.html`
   (perto de `#system-status`) um controle simples (`<select>` ou pequeno menu) listando os
   candidatos de `FREE_LLM_CANDIDATES`/`configuredCandidates` disponíveis (o servidor precisa expor
   essa lista — hoje ela só existe em `server/model-registry.js`; criar uma rota leve, ex.
   `GET /api/models`, que devolve a lista de candidatos configurados sem expor chaves). A escolha do
   usuário é persistida em `localStorage` e enviada no corpo de `POST /api/interpret-transmission`
   como `preferredModelId` (opcional). `createAutoFreeProvider`/`interpret-transmission.js` passam a
   **reordenar** `candidates` colocando o preferido primeiro, mas mantendo os demais como fallback —
   ou seja, a seleção nunca desativa o failover automático, só prioriza.
2. **Indicador de modelo sempre visível**, não só em debug: exibir depois de cada resposta do
   controlador (ex.: rodapé da mensagem em `addMessage`, ou no `#system-status`) algo como
   `openrouter · qwen/qwen3.8-27b:free` (e, se `fallbackDepth > 0`, um indicador visual de que houve
   troca automática, ex. `↻ modelo alternativo`). Fonte de dados: os mesmos campos que já existem em
   `diagnostics`, só deixando de depender de `debug=1`.
3. **Consciência de contexto ao trocar de modelo:** hoje `limitedSessionContext(state)` já é
   reconstruído do zero a cada chamada a partir do `state` atual (não há cache por modelo), então
   trocar de modelo no meio da sessão já herda cenário/estado corretamente por construção — este
   ponto já está coberto estruturalmente; o trabalho aqui é só **adicionar um teste que prove isso**
   (chamar `auto-free-provider` duas vezes seguidas com candidatos diferentes e o mesmo `state`,
   verificar que o payload enviado a cada um contém o mesmo `sessionContext`/`scenarioContext`
   atualizado).
4. **Orçamento de tokens por modelo:** criar `src/llm/context-budget.js` com (a) uma tabela estática
   de orçamento aproximado de tokens de entrada por candidato (a confirmar os valores reais de cada
   modelo `:free` antes de codar — não presumir), (b) uma função `trimSessionContext(context, budget)`
   que usa uma heurística simples (ex. `caracteres / 4 ≈ tokens`) para cortar o histórico
   dinamicamente até caber no orçamento do candidato **que está prestes a ser tentado**, em vez do
   corte fixo de "últimas 2 transmissões" hoje embutido em `limitedSessionContext`. `auto-free-provider`
   usa isso para pular, sem sequer tentar a chamada de rede, um candidato cujo orçamento não comporta
   o payload atual — registrando o motivo do pulo em `failures` com código `context_budget_exceeded`.
5. Se a Decisão 0 optar por manter `voice.html`, replicar o mesmo padrão de seleção/indicador/fallback
   em `server/providers.js`, migrando-o para consumir `configuredCandidates`/`auto-free-provider` em
   vez do provider único `groq`/`mock` — isso também resolveria, de quebra, o fato de esse caminho
   nunca ser fundamentado nos manuais.

### Tarefas

- [ ] Criar `GET /api/models` (handler em `server/models.js` + wrapper em `api/models.js`), devolvendo `{ provider, id }[]` de `configuredCandidates(env)`, sem segredos.
- [ ] Adicionar seletor de modelo em `index.html`/`web/app.js`, com persistência em `localStorage` e envio de `preferredModelId`.
- [ ] Alterar `createAutoFreeProvider` para aceitar `preferredModelId` e reordenar `candidates` mantendo o restante como fallback.
- [ ] Expor `provider`/`actualModel`/`fallbackDepth` na UI normal (fora de `?debug=1`).
- [ ] Criar `src/llm/context-budget.js` com a tabela de orçamento (**bloqueante:** confirmar valores reais de janela de contexto dos candidatos `:free` atuais antes de codar) e `trimSessionContext`.
- [ ] Integrar `context-budget.js` em `auto-free-provider.js`, pulando candidatos que não comportam o payload, com novo código de falha `context_budget_exceeded`.
- [ ] Testes novos: `test/auto-free-provider.test.js` (não existe hoje) cobrindo reordenação por preferência, fallback após falha do preferido, e pulo por orçamento excedido; teste de continuidade de contexto entre dois candidatos.

### Critério de aceite

O usuário consegue escolher um modelo preferido na interface; se ele falhar, a próxima resposta
chega normalmente via o próximo candidato, e a UI mostra qual modelo respondeu de fato — sem exigir
`?debug=1`. Trocar de modelo no meio de uma sessão não perde cenário, fase de voo nem histórico
recente.

---

## 6. Sequenciamento sugerido

1. **Decisão 0** (arquitetura de uma única interface) — condiciona esforço de tudo abaixo.
2. **Item 1** (TTS de esclarecimento) — isolado, baixo risco, alto valor imediato de imersão.
3. **Item 3** (autorização pendente estruturada) — precisa vir antes do item 2 ganhar valor completo, porque a matriz de regressão deve validar o *novo* formato de cotejamento, não o antigo.
4. **Item 2** (matriz de regressão) — construída já em cima do resultado do item 3, serve de rede de segurança para os itens 4 e 5.
5. **Item 4** (PTT) — pode andar em paralelo ao 2/3, é independente do LLM.
6. **Item 5** (seleção de modelo/token budget) — por último, porque depende da Decisão 0 (para saber se mexe em um ou dois caminhos de servidor) e se beneficia da matriz do item 2 já existir para não regredir qualidade de resposta ao mudar orçamento de contexto.

## 7. Bloqueantes que exigem confirmação de Lucas antes de codar

- Decisão 0: descontinuar `voice.html`/`App.jsx` ou unificá-lo com o pipeline documental.
- Item 3: lista definitiva de campos de cotejamento obrigatório vs. informativo por tipo de autorização, confirmada no ICA 100-12 (não deduzida do código atual).
- Item 5: janelas de contexto reais atuais de cada modelo `:free` configurado, para a tabela de orçamento de tokens.
