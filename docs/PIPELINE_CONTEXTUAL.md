# Pipeline contextual e auditoria do grounding

## Diagnóstico reproduzido

A arquitetura anterior enviava a frase completa diretamente ao BM25 e só depois
procurava um ID rígido associado a cinco intenções detectadas por `includes`.
Informação operacional adicional elevava artigos incidentais no ranking; sinônimos
como “pronto para movimentação” não ativavam a intenção. A falha era uma combinação
de **C (indexado, mas nem sempre recuperado)**, **D (o grounding descartava todos os
resultados se o ID rígido saísse do top 8)** e **E (interpretação lexical limitada)**.
O estado também não preservava ATIS, regras de voo ou destino (F parcial).

O Art. 125 necessário ao táxi está presente e contém solicitação, resposta e
fraseologia PT/EN. A auditoria automatizada confirma 374 chunks, IDs únicos,
ordem original consistente e correspondência exata corpus/índice.

## Limitação da auditoria documental

Os PDFs/documentos originais não estão no repositório nem no ambiente. Portanto,
não é possível provar por comparação primária que não houve omissão de páginas,
tabelas ou formatação na extração. Os chunks não possuem página e apenas parte
deles possui seção. Há comprimentos entre 9 e 588 palavras, incluindo 10 chunks
com menos de 20 e 13 com mais de 500 palavras. Isso indica fragmentação desigual
e mantém pendente uma auditoria contra os originais.

Execute `npm run audit:corpus` para reproduzir essas métricas.

## Arquitetura nova

> Atualizado após F1/F6/F7. As etapas abaixo são as do fluxo em produção hoje; as afirmações
> anteriores sobre “formulação de consulta por intenção” e “fonte normativa esperada por intenção”
> descrevem a arquitetura pré-F1 e foram substituídas (o histórico está em `docs/REFATOR_DEEP.md`).

O fluxo de produção é:

1. entrada original e normalização de fonia;
2. interpretação: `POST /api/interpret-transmission` (LLM-first, structured output validado) com
   `interpretTransmission` determinístico como fallback identificado;
3. **resolução no contexto** (`dialogue.js`): se há autorização a cotejar e a fala traz marcador
   documentado de cotejamento, a interpretação passa a ser de cotejamento **antes** da recuperação;
4. enriquecimento controlado com estado da sessão;
5. **plano de recuperação por predicado documental** (`knowledge.js` + `knowledge/evidence-rules.js`):
   a família de intenção escolhe a variante documentada e os artigos candidatos, cada um com citação;
6. BM25 da frase original + consultas expandidas + prior documental por metadados + fallback de
   língua original (`retrieval.js`);
7. fusão/reranking e expansão de vizinhos da mesma seção/artigo;
8. **cobertura** (`knowledge.js`): só é `documented` quando a variante foi escolhida e a fonte
   realmente recuperada; caso contrário, o motivo é explícito (informação do piloto faltante, dado de
   sessão ausente, dado externo não integrado, família não implementada ou fala não compreendida);
9. **realização** (`phraseology.js`): a fala vem de elementos tipados, com citação documental;
   elemento de instrução sem fonte recuperada bloqueia a decisão;
10. atualização validada de fase, frequência, posição e contexto (`state-machine.js`);
11. resposta, evidência, fonia e avaliação.

A interpretação usa grupos de conceitos e radicais independentes, não uma lista de
frases completas. Assim, saudações, indicativo, ATIS, posição, VFR/IFR, destino e
texto acessório não diluem a intenção operacional. Não foram adicionados embeddings
ou LLM: o conjunto local determinístico atingiu 18/18 casos grounded, contra 9/18
do baseline (recall de 50% para 100%), sem custo, rede ou exposição de chaves.

## Grounding e estado

Cada **variante documentada** de uma família de intenção declara os artigos que a fundamentam
(`src/knowledge/evidence-rules.js`) e cada entrada carrega sua citação. O prior de metadados só
coloca esses chunks entre os candidatos; o controlador exige que existam no contexto recuperado e só
cita IDs presentes nesse contexto. Uma variante que exige informação do piloto gera pergunta
registrada no estado (`contexto.pergunta_pendente`); uma família sem contrato de decisão é declarada
como limitação do simulador (`family-not-implemented`) — nunca como ausência de cobertura no manual,
que era o defeito A3.1. O sinal de informação faltante da interpretação é consumido como **entrada**
da decisão: ele só pode confirmar que um requisito documentado não foi satisfeito, jamais criar
requisito novo.

O estado aceita somente uma lista fechada de campos. ATIS, regras de voo, destino,
última intenção e última autorização são isolados por instância de sessão. Posição
explícita pode atualizar a aeronave. Saídas do parser ou de eventual LLM nunca
alteram o estado diretamente.

## Observabilidade

Com `?debug=1`, a aplicação mantém em `window.__ATC_DEBUG__` registros estruturados
com texto, normalização, intenção/confiança, entidades, query, ranking BM25,
reranking, expansão contextual, evidências, decisão, motivo e transição. O modo é
opt-in e não registra variáveis de ambiente ou segredos.

## Avaliação e limitações

`test/contextual-pipeline.test.js` cobre 27 formulações de interpretação e 18 fluxos
grounded PT/EN, incluindo táxi curto/longo, decolagem, circuito, saída VFR,
aproximação, pouso, emergência, frequência, readback, ambiguidade prática,
incompletude e falta real de cobertura. A frase de regressão longa extrai ATIS,
posição, regras e setor. Casos finais incluem formulações diferentes do exemplo.

Pendências: comparar o corpus aos PDFs oficiais; enriquecer metadados de página e
seção; e ampliar o motor de decisão para outros procedimentos antes de considerá-los
operacionalmente cobertos. Este continua sendo um simulador de treinamento.

## PTT, mudança de frequência e síntese de voz

Uma pressão do PTT agora cria uma sessão de reconhecimento. Resultados `interim`
e `final` são substituídos pelo respectivo `resultIndex`, exibidos durante a fala
e consolidados em ordem somente no `onend`. Erro ou cancelamento descartam o
parcial; nenhum evento intermediário chama o pipeline. Isso elimina transmissões
por fragmento sem recorrer a debounce.

Uma solicitação de **mudança** de frequência é uma solicitação de autorização: o
MCA 100-16 art. 59 sustenta a aprovação e o piloto não precisa fornecer uma nova
frequência. Já um pedido para o controlador **informar** a frequência só pode ser
atendido quando o cenário a configurar. Sem esse dado, a decisão explicita falta
de contexto operacional, mantém a frequência atual e não inventa procedimento.

A síntese usa uma única `SpeechSynthesisUtterance`, escolhe deterministicamente
uma voz por locale e indicadores de qualidade (nunca por posição na lista), e
mantém texto visual separado da versão de pronúncia. Indicativos e frequências
são expandidos apenas para a fala. Os testes automatizados usam implementações
controladas da Web Speech API; microfone e vozes instaladas continuam dependendo
de validação humana no navegador/sistema operacional de destino.

## Evolução LLM-first

Após nova validação humana, o parser lexical foi reposicionado como fallback. O
caminho normal chama `POST /api/interpret-transmission`; um provider permitido pela política zero-cost retorna apenas uma
interpretação validada pelo schema. Estado confirmado e histórico da sessão entram como contexto,
**cortado pelo orçamento da janela do candidato** que será tentado (`src/llm/context-budget.js`),
preservando identidade, fase, frequência, última autorização e autorização/pergunta pendente. A
interpretação gera busca, mas não autoriza, seleciona evidência nem altera estado. As ADRs completas
estão em `docs/ADR-001-LLM-FIRST.md`, `docs/ADR-002-ZERO-COST.md` e
`docs/ADR-003-DIALOGO-E-EVIDENCIA.md`.

Falhas do provider são diagnosticadas separadamente e ativam
`deterministic_fallback`. O retrieval deixou também de inserir automaticamente o
artigo mapeado: o prior de intenção agora só aumenta o score quando BM25/aliases
realmente recuperam esse ID. Grounding continua exigindo evidência presente na
recuperação atual.
