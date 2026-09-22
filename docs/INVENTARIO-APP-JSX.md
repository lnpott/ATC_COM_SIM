# Inventário da implementação paralela de voz (`voice.html` + `src/App.jsx`)

Entregável do **F0** (ver `docs/REFATOR_DEEP.md`, §E-F0). O §17 do PLANO_REF exige analisar a
implementação paralela e identificar o que tem valor **antes** de planejar sua descontinuação.
Este documento é a checklist com decisão escrita por item, usada como critério de conclusão do F7.

Contexto (verificado no código, não presumido): `voice.html` → `src/main.jsx` → `src/App.jsx` →
`src/services/generateReply.js` → `POST /api/generate-reply` → `server/providers.js`. Esse caminho
**não tem RAG, não tem estado de voo e não tem grounding** (`SYSTEM_PROMPT` em `server/providers.js`
instrui explicitamente a "não emitir uma autorização operacional real"). Nenhum item abaixo é
conhecimento operacional — todos são apresentação, robustez de interface ou padrões de código.
Portanto nenhum deles, ao ser portado, pode conflitar com a verdade documental.

## Decisões por item

| # | Item existente na implementação paralela | Decisão | Onde é tratado | Justificativa |
|---|---|---|---|---|
| 1 | Alternância explícita PT/EN na UI (`segmented`, botões `pt-BR`/`en-US`) | **Portar com restrição** | F7 (`index.html` + `web/app.js`) | O idioma **não** pode virar uma propriedade livre do usuário: ele determina a base documental recuperada (`ManualSearch.search({ idioma })`), a voz do TTS e os textos do controlador. Portar como indicação de idioma + alternância que troca para o cenário equivalente no outro idioma, preservando a sessão apenas se o idioma não mudar. |
| 2 | `onPointerLeave` no botão de PTT | **Substituído (mais abrangente)** | F4 (`src/ptt-state.js` + `web/app.js`) | O F4 registra `pointerup`/`pointercancel` em `window` escopados à operação ativa, cobrindo soltar fora do botão e fora da janela. `pointerleave` permanece apenas como salvaguarda redundante, sem custo. |
| 3 | Detecção explícita de `speechSupported` + aviso visível quando a Web Speech API não existe | **Portar** | F7 (`index.html` + `web/app.js`) | O simulador documental hoje falha de forma silenciosa nesse caso. O aviso deve declarar a degradação para entrada por texto, que já funciona sem Web Speech. |
| 4 | Indicadores de canal (radar/status por estado) | **Portar parcialmente** | F4 | O vocabulário visual deve vir da máquina de canal `livre/transmitindo/recebendo` (F4), não dos estados `idle/listening/processing/speaking` do `App.jsx`, que colapsam estágios internos do pipeline — o mesmo defeito registrado em A3.10. |
| 5 | Orçamento de histórico `slice(-8)` no contexto enviado | **Descartar / substituir** | F6 (`src/llm/context-budget.js`) | Corte fixo é exatamente o defeito A3.12: o orçamento deve ser derivado da janela real do candidato e preservar invariantes de estado (identidade, fase, frequência, autorização pendente, emergência). |
| 6 | Fluxo `handleResult` → `generateReply` (`/api/generate-reply`) | **Descartar** | F7 (remoção) | Caminho sem grounding, sem estado e com prompt que proíbe autorização real (A3.13). Não pode coexistir com a arquitetura oficial. |
| 7 | Estados `idle / listening / processing / speaking` como rótulos visíveis | **Descartar como vocabulário** | F4 | Expor estágios do pipeline ao piloto é o problema central do §18; o estado visível deve ser o do canal de rádio. |
| 8 | `speak()` retornando `Promise` resolvida em `onEnd`/`onError` | **Portar o padrão** | F4 | É exatamente o mecanismo necessário para que `recebendo → livre` dependa do fim do TTS, e não do fim de `transmit()`. |
| 9 | Aviso de erro de permissão de microfone (`t.permission`) | **Portar** | F7 | Alinha a UI oficial ao tratamento real de `microphone_error` em `src/audio-capture.js` / `web/app.js`. |
| 10 | `public/radio-mark.svg` | **Decidir no F7** | F7 | Marca visual sem conteúdo operacional; usar ou remover junto com a descontinuação, evitando asset órfão. |
| 11 | `src/styles.css` (estilos do React) | **Avaliar no F7, sem portar cegamente** | F7 | Pode conter linguagem visual útil, mas a interface oficial já tem `web/styles.css`; aproveitar trechos específicos em vez de duplicar folhas de estilo. |

## Itens explicitamente **não** portados como autoridade

- `server/providers.js` (`SYSTEM_PROMPT`, `groq`, `mock`, `'auto-free': mock`) — gera resposta sem
  documento; além disso `'auto-free'` aponta para `mock`, ou seja, o nome sugeriria o caminho
  documental e entrega uma demonstração. Nada disso entra no produto.
- Histórico de conversa do `App.jsx` (`historyRef`) — diálogo de chat livre, incompatível com o
  estado validado e com o grounding obrigatório.

## Observações de higiene

- `vite.config.js` declara as duas entradas de build (`simulator` e `voice`); o F7 precisa reduzir a
  uma e verificar que nenhum artefato removido continua referenciado.
- `README.md` publica `/voice.html` como entrega; precisa ser atualizado no F7/F8.
- O único arquivo genuinamente exclusivo da implementação paralela que vale preservar é o padrão de
  `speak()` (item 8), absorvido pelo F4.
