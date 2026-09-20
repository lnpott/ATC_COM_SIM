# ADR-001 — Interpretação semântica LLM-first

Status: **substituído parcialmente pela ADR-002** quanto ao provider. A separação
LLM-first permanece; Gemini não integra mais o pipeline zero-cost.

## Arquitetura anterior e problema

O simulador consolidava o Web Speech por sessão, mas a compreensão principal ainda
era `src/transmission.js`: famílias lexicais, stems e regras determinísticas
classificavam intenção e extraíam entidades. Retrieval híbrido, grounding,
controlador e estado eram etapas separadas e seguras, porém testes humanos
demonstraram que o classificador lexical não generaliza suficientemente para fala
natural nem para pequenas imperfeições reais de STT.

## Decisão

**Semantic interpretation is LLM-first, deterministic-validation-second.** O
parser determinístico deixa de ser o mecanismo principal e permanece como fallback
explicitamente identificado e como auxiliar de validação/normalização.

Pipeline proposto:

```text
áudio → PTT/sessionId → STT consolidado → normalização superficial
→ POST /api/interpret-transmission → Gemini structured output → schema
→ contexto confirmado da sessão → queries semânticas → BM25 + metadata
→ reranking + vizinhos → grounding determinístico → decisão operacional
→ resposta segura → atualização validada → TTS → histórico/debug
```

Gemini interpreta, mas não autoriza, não escolhe fontes, não altera estado e não
compõe procedimentos. O endpoint é server-side, usa `GEMINI_API_KEY`, aplica
timeout e nunca retorna segredo. Em indisponibilidade, o pipeline usa fallback
determinístico e registra `interpretationMode=deterministic_fallback`.

## Arquivos previstos

- `api/interpret-transmission.js` e handler compartilhado em `server/`;
- `src/llm/{schemas,provider,gemini-provider,semantic-interpreter}.js`;
- `src/pipeline.js`, `src/retrieval.js`, `src/controller.js` e `web/app.js`;
- `src/speech.js` para identidade/isolamento de sessão PTT;
- testes LLM mockados, Gemini opt-in, held-out e PTT;
- `README.md`, esta ADR e documentação do pipeline/deploy.

## Consequências e limites

O caminho normal passa a depender de uma chamada Gemini por transmissão final. A
falha do provider não equivale a ausência documental. Grounding e validação de
estado continuam determinísticos. Não há chamada durante resultados intermediários
de STT. A validação automatizada do Web Speech usa implementação controlada; um
microfone físico continua exigindo verificação humana.
