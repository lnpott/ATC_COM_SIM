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

O fluxo de produção é:

1. entrada original e normalização de fonia;
2. interpretação determinística em conceitos e entidades (`transmission.js`);
3. enriquecimento controlado com estado da sessão;
4. formulação de consulta por intenção (`retrieval.js`);
5. BM25 da frase original + consultas expandidas + prior documental por metadados;
6. fusão/reranking e expansão de vizinhos da mesma seção/artigo;
7. verificação de que a fonte esperada foi realmente recuperada;
8. decisão diferenciada: não compreendido, falta de dado, documentado ou sem cobertura;
9. atualização validada de fase, frequência, posição e contexto;
10. resposta, evidência e avaliação.

A interpretação usa grupos de conceitos e radicais independentes, não uma lista de
frases completas. Assim, saudações, indicativo, ATIS, posição, VFR/IFR, destino e
texto acessório não diluem a intenção operacional. Não foram adicionados embeddings
ou LLM: o conjunto local determinístico atingiu 18/18 casos grounded, contra 9/18
do baseline (recall de 50% para 100%), sem custo, rede ou exposição de chaves.

## Grounding e estado

Cada intenção possui uma fonte normativa esperada. O prior de metadados só coloca
esse chunk entre os candidatos; o controlador ainda exige que ele exista no
contexto recuperado e só cita IDs presentes nesse contexto. Uma intenção clara sem
dado obrigatório pede esclarecimento. Intenção desconhecida pede intenções; uma
categoria entendida sem fonte configurada retorna ausência real de cobertura.

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
interpretação validada pelo schema. Estado confirmado e no máximo duas mensagens
recentes entram como contexto. A interpretação gera busca, mas não autoriza,
seleciona evidência nem altera estado. A ADR completa está em
`docs/ADR-001-LLM-FIRST.md`.

Falhas do provider são diagnosticadas separadamente e ativam
`deterministic_fallback`. O retrieval deixou também de inserir automaticamente o
artigo mapeado: o prior de intenção agora só aumenta o score quando BM25/aliases
realmente recuperam esse ID. Grounding continua exigindo evidência presente na
recuperação atual.
