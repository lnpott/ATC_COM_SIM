# ADR-002 — Pipeline semântico multi-provider de custo zero

Status: **aceito**.

## Decisão

Enquanto `ZERO_COST_MODE=true`, `ALLOW_PAID_API` deve ser `false` e nenhuma rota
pode consumir saldo, crédito ou pay-as-you-go. `server/cost-policy.js` bloqueia
provider/modelo antes da rede. OpenRouter exige ID `:free` ou `openrouter/free` e
preço zero confirmado no catálogo público atual. Um custo não-zero observado
invalida o cache e bloqueia a resposta. Gemini foi removido do pipeline.

Groq fixo seria preferível pela estabilidade e também serviria Whisper, mas uma
chave funcional não prova que a organização é Free. Sem acesso autenticado que
comprove tier e ausência de billing, `GROQ_FREE_TIER_CONFIRMED=false`; nenhuma
chamada Groq ocorre. Se futuramente confirmado, os modelos fixos são avaliados por
benchmark, não por fama ou tamanho.

A sequência LLM é:

```text
Groq fixo (somente tier confirmado)
→ qwen/qwen3.8-27b:free
→ google/gemma-4-26b-a4b-it:free
→ openrouter/free
→ fallback determinístico
```

Modelos fixos gratuitos precedem o roteador porque dão identidade e comportamento
mais reproduzíveis. O roteador é resiliente, mas seu modelo efetivo varia e por
isso `requestedModel` e `actualModel` são sempre distintos no diagnóstico.

## Voz/STT

MediaRecorder produz um único blob. A cadeia é Groq Whisper somente se confirmado,
ASR local `onnx-community/whisper-tiny` carregado sob demanda em Web Worker com
WebGPU/WASM e Web Speech final. TTS usa somente SpeechSynthesis. O modelo local é
compacto e não é baixado no carregamento inicial; pesos ficam sujeitos ao cache do
browser/CDN. O teste automatizado usa fixture e adapters controlados; microfone
físico exige teste humano.

## Segurança operacional

LLM apenas interpreta. RAG recupera. Grounding exige IDs da recuperação atual. O
controlador e a máquina de estados decidem/validam. Nenhum provider pode inventar
pista, frequência, altitude, rumo, autorização ou fonte. Readback compara valores
operacionais da última autorização e distingue correto, incompleto e divergente.
