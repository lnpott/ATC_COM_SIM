# ATC Simulator — Plano de Execução

**Simulador de fonia de tráfego aéreo por voz, em português e inglês, ancorado nos manuais da aeronáutica brasileira.**

Documento escrito como *briefing de entrega*: qualquer IA ou desenvolvedor deve conseguir pegar este arquivo isolado, sem contexto anterior, e executar do início ao fim.

Data: 19/09/2026 · Autor do projeto: Lucas · Status: versão funcional local das Fases 1 a 5 implementada e auditada; validações externas permanecem pendentes.

---

## 1. O que é o produto

Uma aplicação web em que o usuário aperta um botão, **fala pelo microfone** usando fraseologia aeronáutica, e a IA **responde por voz** fazendo o papel de:

- **Controlador de tráfego aéreo** (torre, solo, controle, APP), e
- **Outras aeronaves** presentes no mesmo circuito/frequência, para criar ambiente realista.

O objetivo é treino de fraseologia. Portanto a métrica de sucesso não é "a conversa fluiu", e sim **"a resposta está correta segundo o manual"**.

### Regra de ouro do projeto

> A IA **não pode inventar** fraseologia, autorização ou procedimento. Toda resposta precisa estar ancorada em trecho recuperado dos manuais. Se não houver base documental para responder, a IA declara que não há cobertura para aquilo — nunca improvisa.

Isso é o requisito que define a arquitetura inteira (ver seção 4, RAG).

---

## 2. Restrições dadas pelo dono do projeto

| Restrição | Detalhe |
|---|---|
| Custo | **Zero na fase inicial**, especialmente quanto a APIs. Nada de cartão de crédito obrigatório. |
| Modalidade | Conversa por voz ("voice live"), não chat de texto. |
| Base documental | Fornecida pelo usuário, em PDF. Já está em mãos. |
| Escopo | Projeto novo, do zero. Não reaproveita código existente. |
| Idiomas | Português **e** inglês (o manual de fraseologia cobre os dois). |

---

## 3. Base documental (fonte da verdade)

Três blocos, tratados como **fontes separadas e identificáveis** — a resposta precisa saber de qual documento veio cada regra.

1. **Manual de Fraseologia (MCA 100-16 ou equivalente fornecido pelo usuário)** — define a fraseologia padrão em português e inglês. É a fonte para *como* falar.
2. **ICA 100-12 — Regras do Ar** — rege regras de tráfego aéreo, o que é autorizado, cotejado, exigido. É a fonte para *o que* pode ser dito/autorizado.
3. **(Eventuais suplementos de tráfego aéreo já contidos no conjunto acima.)**

**Fora de escopo, explicitamente:** normas da ANAC sobre transporte aéreo regular / manejo de companhias aéreas. Não entram na base.

> ⚠️ Confirmar com o usuário a contagem de páginas e os nomes/códigos exatos dos arquivos antes de processar. O código do manual de fraseologia deve ser lido do próprio PDF, não presumido.

---

## 4. Arquitetura

Quatro camadas independentes. Cada uma pode ser trocada sem quebrar as outras.

```
[1] Microfone → texto        (STT)
        ↓
[4] Busca nos manuais         (RAG) → trechos relevantes
        ↓
[2] Modelo de linguagem       (LLM) → resposta do controlador
        ↓
[3] Texto → áudio falado      (TTS)
```

### Camada 1 — Entrada de voz (STT)

**Escolha para custo zero: Web Speech API (`SpeechRecognition`) do navegador.**

- Nativa no Chrome/Edge, não exige chave nem servidor, não gera custo.
- Suporta `lang: 'pt-BR'` e `lang: 'en-US'` — atende os dois idiomas do treino.
- Limitação conhecida: precisão cai com jargão aeronáutico e alfabeto fonético ("Papa Tango Alfa Zulu Xis"). **Mitigação obrigatória:** camada de normalização pós-STT que corrige o texto transcrito antes de mandar ao LLM (ver seção 6).
- Limitação: Safari/Firefox têm suporte irregular. Definir Chrome como alvo na v1.

*Plano B pago/futuro:* Whisper (OpenAI) ou faster-whisper self-hosted, quando precisão virar gargalo.

### Camada 2 — Inteligência (LLM)

Opções gratuitas verificadas em 2026. Recomendação: **Groq como primário, Gemini como fallback.**

| Provedor | Por que | Observação |
|---|---|---|
| **Groq** | <cite index="9-1">tier gratuito real, sem cartão de crédito, sem sistema de créditos e sem cobrança por token — limitado apenas por rate limits</cite>. Latência muito baixa, o que importa numa conversa por voz. | <cite index="1-1">Modelos antigos como llama-3.3-70b e llama-3.1-8b foram desligados em agosto de 2026; limites variam por modelo, a maioria em 1.000 requisições/dia</cite>. Checar o catálogo atual em console.groq.com. |
| **Google AI Studio / Gemini** | <cite index="3-1">contexto de até 1 milhão de tokens no Gemini Flash no tier gratuito, além de entrada multimodal</cite>. Bom para lidar com documento longo. | <cite index="1-1">O Google não publica mais os limites de rate por modelo no tier gratuito — é preciso conferir a cota no AI Studio</cite>. |

Padrão de implementação: **abstrair o provedor atrás de uma interface única** (`generateReply(messages, context)`), com fallback automático em erro 429. Isso permite trocar de provedor, ou migrar para um pago, sem tocar no resto do app.

> Não usar a Realtime API da OpenAI na v1: ela é cobrada por minuto de áudio e **não tem tier gratuito**, o que viola a restrição de custo.

### Camada 3 — Saída de voz (TTS)

**Escolha para custo zero: `speechSynthesis` da Web Speech API.**

- Gratuita, nativa, instantânea, sem chave.
- Vozes em pt-BR e en-US disponíveis no sistema operacional.
- Qualidade robótica comparada a TTS neural — mas, para treino de fonia, isso é **aceitável e até desejável**: rádio VHF real também é sofrível. Aplicar filtro de áudio (band-pass + leve ruído + clique de PTT) aumenta o realismo mais do que uma voz bonita.

### Camada 4 — Base de conhecimento (RAG)

O núcleo da precisão. Sem isso o simulador vira invenção.

**Pipeline de ingestão (roda uma vez, offline):**

1. Extrair texto dos PDFs preservando estrutura (seções, itens numerados, tabelas de fraseologia).
2. **Chunking semântico**, não por tamanho fixo. Em manual de fraseologia, a unidade natural é o par situação → frase padrão. Quebrar um par no meio destrói a utilidade.
3. Cada chunk guarda metadados: `documento`, `seção`, `item`, `idioma`, `fase_de_voo` (solo, decolagem, rota, aproximação, pouso), `tipo` (regra | fraseologia).
4. Gerar embeddings. Opções gratuitas: `all-MiniLM-L6-v2` local via transformers.js (roda no navegador, custo zero absoluto) ou API de embeddings gratuita do Gemini.
5. Armazenar. Para v1: arquivo JSON estático com os vetores, carregado no cliente. Sem banco, sem servidor, sem custo. Se crescer, migrar para pgvector no Supabase (tier gratuito).

**Em tempo de execução:**

1. Texto do usuário + fase de voo atual → busca vetorial (top 5–8 chunks).
2. Filtrar por metadados (se está em solo, não trazer fraseologia de rota).
3. Injetar os trechos no prompt como contexto autorizado.
4. Exigir que a resposta cite internamente a origem, para permitir auditoria e o modo "explicar" (seção 7).

---

## 5. Motor de simulação (o que dá vida ao exercício)

O LLM sozinho não mantém coerência de cenário. Precisa de uma **máquina de estados** em código, fora do modelo:

```js
{
  aeronave:   { indicativo, tipo, posicao, altitude, proa, velocidade },
  cenario:    { aerodromo, pista_em_uso, condicoes_meteo, qnh, trafego_na_frequencia[] },
  fase:       'solo' | 'taxi' | 'decolagem' | 'rota' | 'aproximacao' | 'pouso',
  frequencia: 'solo' | 'torre' | 'aproximacao' | 'controle',
  historico:  [ ...transmissoes ]
}
```

Regras:

- O estado é **fonte da verdade sobre o mundo**; o LLM só narra o que o estado permite.
- Após cada resposta, o LLM devolve (em JSON estruturado, separado do texto falado) as atualizações de estado — que o código valida antes de aplicar.
- Aeronaves de tráfego são simuladas pelo mesmo modelo, com indicativos e personalidades distintas, para popular a frequência.

---

## 6. Normalização de fraseologia (peça crítica, fácil de esquecer)

Entre o STT e o LLM, um módulo determinístico em código:

- **Alfabeto fonético:** "alfa bravo charlie" → `ABC`, nos dois idiomas.
- **Números aeronáuticos:** "dois nove nove dois" → `2992`; "um zero mil" → `FL100`; tratar "niner"/"tree"/"fife" em inglês.
- **Indicativos:** reconhecer e padronizar prefixos (PT-, PR-, PP-) e designadores de companhia.
- **Erros comuns do STT:** dicionário de correção ("passa um dois três" → "PA-123"; "decolagem" vs "de colagem").

Simetricamente, **antes do TTS**, o caminho inverso: converter `RWY 28` em "pista dois oito", `QNH 1013` em "QNH um zero um três", para que a voz soe como rádio e não como leitura de planilha.

Esse módulo é o que separa um brinquedo de uma ferramenta de treino.

---

## 7. Funcionalidades além do básico

Priorizadas por valor de treino:

1. **Cotejamento avaliado** — o sistema verifica se o usuário cotejou corretamente a autorização recebida e sinaliza omissões (item obrigatório pelas Regras do Ar).
2. **Modo explicação** — ao fim de cada transmissão, o usuário pode pedir "por quê?" e receber a citação do manual, com documento e item. Só é possível porque o RAG guarda procedência.
3. **Relatório de sessão** — erros recorrentes de fraseologia, itens omitidos, score.
4. **Cenários prontos** — VFR local, tráfego de aeródromo, IFR de partida, pane e emergência.
5. **Alternância PT/EN** — o mesmo cenário rodado nos dois idiomas, usando os dois lados do manual de fraseologia.

---

## 8. Stack sugerida

Alinhada ao que o Lucas já usa, para reduzir atrito:

- **Front-end:** React + Vite + Tailwind.
- **Hospedagem:** Vercel (tier gratuito).
- **Persistência (se necessária):** Supabase (tier gratuito) — apenas para histórico e relatórios; nada é exigido na v1.
- **Chaves de API:** nunca no cliente. Usar Vercel Functions como proxy fino para o provedor de LLM.
- **Embeddings/índice:** arquivo estático gerado no build.

---

## 9. Roadmap

### 9.1 Registro de execução verificado no repositório

Este registro descreve somente o que pode ser comprovado pelos arquivos versionados. A prova de
conceito de voz foi informada como concluída antes desta etapa, mas seu código não está neste
repositório; por isso ela não é marcada como verificada aqui.

**Concluído e verificável:**

- o corpus está versionado em `atc-simulator-chunks.json`, com 374 trechos e IDs únicos;
- o índice lexical BM25 está versionado em `atc-simulator-index.json` e alinhado por posição com o
  corpus;
- `src/search.js` implementa a busca isolada da interface e da geração de autorizações, com entrada
  composta por `texto`, `idioma` e `fase_de_voo`;
- a busca filtra idioma e fase, preserva trechos bilíngues e de fase geral, e retorna entre cinco e
  oito candidatos com procedência e score;
- `reference/search-queries.v1.json` registra consultas para solo, decolagem, rota, aproximação,
  pouso, emergência e ausência de cobertura;
- `test/search.test.js` e `scripts/validate-search.mjs` verificam recuperação, filtros, contrato de
  saída, IDs e alinhamento entre corpus e índice.

**Ainda não concluído ou não verificável neste repositório:**

- os PDFs de origem, seus nomes exatos e suas contagens de páginas não estão versionados; os códigos
  e versões existentes são metadados derivados e ainda precisam ser conferidos nos PDFs;
- não há pipeline reproduzível de extração e chunking diretamente dos PDFs; a geração do índice a
  partir do corpus, por outro lado, já é reproduzível por `scripts/build-index.mjs`;
- não foram implementados embeddings nem busca vetorial: a implementação atual é lexical (BM25);
- as contas/chamadas dos provedores de LLM e seus limites não podem ser auditados a partir deste
  repositório e nenhum provedor externo está configurado;
- existe uma interface web funcional com controlador determinístico local; ela não substitui a futura
  validação de um provedor de LLM, mas permite testar o fluxo sem custo ou chaves;
- STT/TTS possuem adaptadores para Web Speech API, enquanto os módulos de domínio não fazem chamadas
  externas por projeto.

### 9.2 Próximo passo seguro

Antes de conectar a busca ao simulador, executar uma revisão de aceitação da Fase 2 com os PDFs de
origem: conferir manualmente os artigos esperados das consultas de referência, registrar nome,
código, versão e páginas dos documentos e definir um critério explícito de cobertura mínima. Uma
consulta sem evidência lexical hoje ainda devolve candidatos com `score` zero para cumprir o contrato
de quantidade; esses candidatos **não devem** ser usados para gerar uma autorização. Depois dessa
revisão, o próximo incremento deve ser o extrator reproduzível dos PDFs. A geração do índice a partir
do corpus já está automatizada, e qualquer integração externa deve manter os testes de regressão
aprovados.

### 9.3 Checklist por fase

**Fase 0 — Preparação**
- [ ] Confirmar arquivos, códigos e número de páginas dos manuais.
- [ ] Criar contas gratuitas: Groq e Google AI Studio. Testar os limites reais com uma chamada antes de assumir os números publicados.

**Fase 1 — Prova de conceito de voz (1 tela)**
- [x] Tela versionada com PTT → `SpeechRecognition` → normalização/busca/controlador local → `speechSynthesis`.
- [ ] Repetir a prova com provedor real de LLM depois de validar limites e configurar proxy seguro.

**Fase 2 — Base de conhecimento**
- [ ] Pipeline reproduzível de extração e chunking dos PDFs (os artefatos existem, mas o extrator não).
- [x] Corpus e índice lexical BM25 estáticos, alinhados e com IDs únicos.
- [x] Geração reproduzível do índice BM25 a partir do corpus e verificação contra o arquivo versionado.
- [ ] Embeddings e busca vetorial (não são usados pela implementação atual).
- [x] Busca funcionando isoladamente, sem conexão com a geração de autorizações.
- [x] Consultas de referência versionadas e cobertas por testes unitários e validação estática.
- [ ] Conferência dos resultados de referência diretamente nos PDFs de origem.

**Fase 3 — Simulador real**
- [x] Máquina de estados com transições e atualizações permitidas explicitamente.
- [x] Grounding do controlador com a regra de ouro, recusa sem cobertura e validação das fontes.
- [x] Controlador local só autoriza quando o artigo específico da intenção está entre os resultados.
- [x] Módulo determinístico de normalização de fraseologia para entrada e expansão para TTS.
- [x] Cenário-base de tráfego de aeródromo VFR em português e sessão integradora independente de LLM.
- [x] Exercitar o cenário completo na interface local com Web Speech e fallback de texto.
- [ ] Repetir o cenário com um provedor real de LLM atrás de proxy, sem expor chaves no cliente.

**Fase 4 — Treino**
- [x] Cotejamento avaliado e explicação com documento, artigo e ID de origem.
- [x] Cenários versionados VFR em português/inglês, partida IFR e emergência.
- [x] Relatório de sessão com score e erros recorrentes.
- [ ] Validar pedagogicamente os critérios de cotejamento com instrutor e manuais de origem.

**Fase 5 — Refinamento**
- [x] Cadeia Web Audio com banda de rádio/compressor e fila que serializa transmissões concorrentes.
- [x] Interface responsiva com seleção de cenário, frequência, PTT/texto, evidências e score.
- [x] Reavaliação técnica registrada: manter Web Speech API na primeira validação integrada, pois o
  repositório ainda não contém evidência comparável que justifique custo ou migração.
- [ ] Medir STT/TTS no navegador com usuários e fraseologia real antes de confirmar a decisão final.

### 9.4 Auditoria das Fases 2 a 5

Auditoria executada sobre os artefatos versionados:

- `npm test` cobre busca, filtros, ausência de cobertura, normalização, máquina de estados, grounding,
  fontes específicas por intenção, cotejamento, relatório, fila de transmissões e sessão integradora;
- `npm run validate` confere corpus/índice, consultas de referência e reprodução exata do índice;
- o gerador `scripts/build-index.mjs` falha com IDs duplicados e possui modo `--check`, evitando que
  alterações no corpus deixem um índice obsoleto;
- `src/grounding.js` impede resposta quando todos os scores são zero e rejeita IDs de fontes que não
  tenham sido recuperados;
- `src/state-machine.js` limita transições e campos mutáveis; atualizações do modelo não são aplicadas
  diretamente ao estado sem validação;
- `src/simulator.js` integra as camadas determinísticas, mas mantém STT, LLM e TTS fora do núcleo;
- `src/speech.js` encapsula STT/TTS gratuitos do navegador, com seleção explícita de `pt-BR`/`en-US`
  e falha controlada quando a API não está disponível;
- não foram adicionadas chaves, contas pagas ou dependências externas.

**Conclusão da auditoria:** os núcleos programáticos previstos nas Fases 2 a 5 estão implementados e
testáveis. Não se considera concluída a validação operacional do produto: faltam os PDFs para auditoria
documental, o extrator PDF e testes reais de navegador/provedor. Esses itens não
podem ser marcados como concluídos somente por testes unitários e constituem os próximos gates antes
de publicação para usuários.

### 9.5 Entrega funcional local

- `index.html`, `web/app.js` e `web/styles.css` formam uma interface responsiva sem framework ou
  dependências de terceiros;
- `server.mjs` serve somente arquivos do repositório, bloqueia travessia de diretório e permite iniciar
  o produto com `npm start` em `http://127.0.0.1:4173`;
- a aplicação carrega o índice pelo navegador, inicia cenários versionados, aceita texto ou PTT,
  normaliza a transmissão, recupera oito trechos e exibe a fonte usada;
- o fluxo real do índice é testado para táxi, decolagem, aproximação, pouso e emergência, exigindo os
  artigos 125, 126, 114, 132 e 64 do MCA 100-16, respectivamente;
- `src/controller.js` detecta a intenção e exige o artigo de fraseologia correspondente antes de
  responder; evidência genérica com score alto não autoriza resposta;
- o fluxo atual é totalmente local e determinístico, portanto funcional sem chave e sem custo. A
  adoção futura de LLM deve ocorrer atrás de proxy e continuar subordinada ao mesmo validador de fontes.

---

## 10. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| STT gratuito erra jargão e fonética | Módulo de normalização (seção 6); aceitar migração para Whisper se persistir |
| Rate limit gratuito estoura em uso contínuo | Fallback multi-provedor; cache de respostas frequentes; prompts enxutos |
| Modelo alucina fraseologia | RAG obrigatório + prompt que proíbe responder sem trecho recuperado + validação de estado em código |
| Limites e modelos gratuitos mudam sem aviso | Abstração do provedor; verificar limites ao vivo, nunca confiar em lista publicada |
| Direitos sobre os manuais | Uso pessoal/treino. Se virar produto público, verificar a situação de distribuição do conteúdo |

---

## 11. Instrução para quem for executar

Se você é uma IA recebendo este documento:

1. Não pule a Fase 0. Peça os PDFs e confirme os códigos dos documentos antes de escrever código.
2. Não presuma fraseologia de memória, nem dos manuais da FAA/ICAO — a base é a documentação brasileira fornecida.
3. Verifique ao vivo os limites e a disponibilidade dos modelos gratuitos citados; esses dados são de setembro de 2026 e envelhecem rápido.
4. Mantenha a regra de ouro da seção 1 escrita literalmente no prompt de sistema do simulador.
