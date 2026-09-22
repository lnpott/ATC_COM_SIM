Você está trabalhando como ARQUITETO DE SOFTWARE E ANALISTA DE REFATORAÇÃO para o projeto:

https://github.com/lnpott/ATC_COM_SIM

IMPORTANTE:
Seu objetivo NESTA ETAPA NÃO É IMPLEMENTAR A REFATORAÇÃO.

Seu objetivo é analisar o contexto fornecido, confrontá-lo com o projeto atual quando necessário e produzir um PLANO DE REFATORAÇÃO completo, coerente, tecnicamente aplicável e organizado por fases.

Não comece modificando arquivos.
Não implemente código.
Não transforme este pedido em uma lista genérica de boas práticas.

O plano deve explicar COMO levar o projeto do estado atual ao comportamento final desejado descrito abaixo.

==================================================
1. OBJETIVO GERAL DO PROJETO
==================================================

O projeto é um simulador de comunicação aeronáutica/ATC, com interação por voz, destinado a simular situações operacionais entre piloto e controle.

O sistema deve utilizar:

- conhecimento documental aeronáutico;
- contexto operacional;
- estado atual da sessão/simulação;
- histórico da comunicação;
- recuperação de conhecimento relevante;
- regras e procedimentos documentados;
- modelos de linguagem gratuitos já previstos/configurados no projeto;
- STT/TTS quando aplicável.

A voz NÃO é o núcleo da inteligência do sistema.

STT e TTS são interfaces de entrada/saída.

A inteligência operacional deve estar no pipeline de interpretação, contexto, conhecimento, estado, recuperação, decisão e geração da resposta.

Portanto:

STT → interpretação/contexto → conhecimento/retrieval → decisão operacional → resposta → TTS

não deve ser tratado simplesmente como:

STT → procurar frase parecida → responder com frase pronta → TTS.

==================================================
2. PRINCÍPIO FUNDAMENTAL: NÃO CRIAR UM ROBÔ DE FRASES PRONTAS
==================================================

O sistema final NÃO deve funcionar como um conjunto de respostas previamente cadastradas para cada situação.

Não queremos:

"Se o usuário disser X, responda sempre Y."

Isso destruiria justamente a finalidade do simulador.

A mesma situação operacional pode ocorrer com diferentes:

- formulações;
- informações disponíveis;
- informações faltantes;
- solicitações;
- intenções;
- sequências de comunicação;
- condições operacionais;
- respostas anteriores;
- mudanças de contexto;
- situações normais;
- situações atípicas;
- exceções;
- emergências;
- coordenações;
- mudanças de frequência;
- instruções subsequentes.

O sistema deve ser capaz de utilizar o conhecimento documental existente para interpretar a situação atual e determinar qual informação/procedimento é aplicável naquele contexto.

A documentação deve funcionar como FONTE DE CONHECIMENTO E RESTRIÇÃO OPERACIONAL.

Ela não deve ser transformada simplesmente em um catálogo de frases.

==================================================
3. EXEMPLO DO COMPORTAMENTO ESPERADO
==================================================

Considere uma situação hipotética:

O controlador autoriza:

"Autorizado 9.000 pés, proa Curitiba."

O piloto responde:

"9.000 pés, proa Curitiba, solicita desvio à direita."

O sistema não deve simplesmente procurar uma resposta pronta para a frase inteira.

Ele deve interpretar que:

- a autorização anterior estabeleceu um contexto;
- o piloto confirmou elementos da autorização;
- surgiu uma nova solicitação;
- a solicitação é um desvio de rota/proa;
- existe informação operacional ainda necessária para que o controlador possa tratar adequadamente essa solicitação.

O controlador pode precisar perguntar qual proa o piloto deseja, dependendo do contexto e das regras/documentação aplicáveis.

Se o piloto responder algo sem relação com a pergunta, por exemplo:

"Uma cerveja e um cigarro."

o sistema não deve produzir uma resposta aleatória nem fingir que aquilo é uma resposta válida.

Deve reconhecer que a resposta não satisfaz a informação solicitada e reagir coerentemente dentro do contexto, por exemplo solicitando confirmação da proa ou esclarecimento.

O exemplo é apenas ilustrativo.

NÃO transforme esses exemplos específicos em regras rígidas.

O comportamento final deve ser derivado da documentação, do contexto operacional e da arquitetura do sistema.

==================================================
4. INTERPRETAÇÃO CONTEXTUAL
==================================================

O sistema deve possuir capacidade de interpretar o significado operacional de uma comunicação, e não apenas identificar palavras.

O modelo deve considerar, quando disponíveis:

- aeronave;
- indicativo;
- posição;
- fase do voo;
- aeródromo;
- frequência;
- órgão de controle;
- autorização vigente;
- instruções anteriores;
- solicitações pendentes;
- informações já confirmadas;
- informações ainda desconhecidas;
- histórico recente;
- situação operacional;
- emergência;
- tráfego relevante;
- mudanças de contexto;
- intenção do piloto;
- resposta à pergunta anterior.

Uma comunicação isolada pode não ser suficiente para determinar a resposta correta.

Nesse caso, o sistema deve utilizar o estado e o histórico da sessão.

==================================================
5. PERGUNTAS, ESCLARECIMENTOS E INFORMAÇÕES INCOMPLETAS
==================================================

O sistema deve ser capaz de:

- fazer perguntas;
- solicitar confirmação;
- pedir uma informação que esteja faltando;
- reconhecer uma resposta incompleta;
- reconhecer uma resposta incompatível com a pergunta anterior;
- reconhecer uma comunicação fora do contexto;
- continuar uma conversa operacional;
- adaptar a resposta ao que já foi estabelecido.

Exemplo:

Controlador:
"Qual proa o senhor deseja?"

Piloto:
"Uma cerveja e um cigarro."

O sistema deve reconhecer que isso não responde à pergunta operacional.

Não deve tratar a resposta como uma nova solicitação aeronáutica simplesmente porque contém palavras compreensíveis.

Deve permanecer dentro do contexto da conversa e solicitar a informação necessária.

Da mesma forma, se uma comunicação trouxer somente parte de uma informação, o sistema deve utilizar o contexto anterior para determinar o que já está conhecido e o que ainda precisa ser esclarecido.

==================================================
6. O SISTEMA NÃO DEVE SER "MONGOLÓIDE" DIANTE DE VARIAÇÕES NATURAIS
==================================================

O simulador deve possuir um nível razoável de interpretação contextual.

Não deve exigir que o usuário utilize exatamente a frase que o programador imaginou.

Se o usuário utilizar uma formulação diferente, mas operacionalmente inteligível dentro do contexto, o sistema deve ser capaz de interpretá-la.

Isso NÃO significa permitir que o modelo invente procedimentos.

Há uma distinção fundamental:

INTERPRETAÇÃO:
o modelo pode interpretar uma comunicação humana diferente da formulação exata encontrada nos documentos.

AUTORIZAÇÃO/PROCEDIMENTO:
o sistema somente pode afirmar, autorizar, instruir ou aplicar procedimento quando houver suporte documental e/ou regra operacional válida.

Portanto:

O LLM pode ajudar a compreender o que o usuário quis dizer.

O LLM NÃO pode inventar o que o controlador deveria autorizar.

==================================================
7. A BASE DE CONHECIMENTO É AMPLA
==================================================

A documentação existente no projeto contém grande parte do conhecimento necessário para o simulador.

Ela deve ser explorada de maneira abrangente.

Antes de criar novas regras, frases, intenções ou comportamentos, determine se eles já estão definidos em:

- corpus;
- documentos;
- manuais;
- metadados;
- procedimentos;
- artigos;
- documentação arquitetural;
- definições existentes no projeto.

O planejamento deve considerar que uma situação pode estar documentada em um local diferente daquele que parece mais óbvio.

Por exemplo:

uma situação atípica pode depender de conhecimento definido originalmente em uma situação típica, procedimento geral, emergência ou regra de coordenação.

O mecanismo de conhecimento deve permitir relacionar essas informações quando forem relevantes.

Não crie uma nova regra simplesmente porque não encontrou imediatamente uma resposta pronta.

Primeiro determine se o conhecimento já existe de outra forma.

==================================================
8. EXEMPLO DE SITUAÇÃO ATÍPICA
==================================================

Considere uma emergência.

O piloto informa:

"Estamos com fogo aqui."

O controlador precisa compreender que existe uma informação crítica incompleta.

Pode ser necessário esclarecer:

"Confirme fogo em qual parte da aeronave."

O piloto responde:

"Fogo no motor direito."

A partir dessa nova informação, o contexto operacional muda.

O sistema deve atualizar o estado/contexto e utilizar o conhecimento correspondente à emergência.

Não queremos:

"Se usuário disser 'fogo', resposta = frase X."

Queremos:

comunicação → interpretação → contexto → informação faltante → esclarecimento → atualização do estado → recuperação do conhecimento aplicável → resposta operacional.

O plano de refatoração deve prever uma arquitetura capaz de produzir esse comportamento.

==================================================
9. INFORMAÇÕES EXTERNAS AO CORPUS
==================================================

A base documental é a autoridade para os procedimentos aeronáuticos do simulador.

Porém, nem toda pergunta feita pelo piloto necessariamente será uma pergunta cuja resposta esteja no corpus.

Exemplo:

O piloto pode estar sob controle de determinado órgão e perguntar sobre o tempo em outro aeródromo.

Nesse caso, a arquitetura futura poderá utilizar uma fonte externa apropriada, como METAR/serviço meteorológico/API, quando essa integração for implementada.

O projeto NÃO deve tratar a ausência dessa integração como motivo para considerar a pergunta incompreensível.

A arquitetura deve ser capaz de distinguir:

1. conhecimento operacional/documental;
2. informação externa/dinâmica;
3. informação contextual da própria sessão;
4. comunicação que exige esclarecimento;
5. comunicação sem cobertura suficiente.

Neste momento, NÃO implemente essa integração externa se ela não fizer parte do escopo atual.

Apenas garanta que a arquitetura planejada não impeça sua futura incorporação.

==================================================
10. VERDADE DOCUMENTAL
==================================================

Existe uma regra fundamental:

O simulador não pode inventar fraseologia, autorização, procedimento ou regra operacional.

Toda decisão operacional deve possuir suporte no conhecimento/documentação disponível.

Se não houver cobertura documental suficiente para uma decisão operacional, o sistema deve possuir um comportamento seguro para reconhecer essa limitação, em vez de inventar.

Porém, "não inventar" NÃO significa responder "não entendi" para qualquer coisa que não esteja literalmente escrita no corpus.

A arquitetura deve separar:

- compreensão da comunicação;
- recuperação de conhecimento;
- decisão operacional;
- geração da resposta.

O fato de uma frase específica não existir literalmente no corpus não significa que a intenção seja incompreensível.

==================================================
11. ESTADO DA SESSÃO
==================================================

O estado operacional deve permanecer externo ao LLM.

O modelo não deve ser a única fonte da verdade sobre:

- aeronave;
- fase do voo;
- frequência;
- autorização;
- solicitações pendentes;
- histórico;
- contexto;
- informações já confirmadas.

O LLM deve receber o contexto necessário para interpretar e produzir a resposta.

Mudanças de estado devem ser validadas pelo sistema.

O plano deve preservar essa separação.

==================================================
12. COTEJAMENTO E AUTORIZAÇÃO
==================================================

O projeto atualmente possui lógica de cotejamento/readback que precisa ser analisada.

Não assuma que todos os elementos de uma transmissão são obrigatoriamente cotejáveis.

É necessário distinguir, conforme a documentação aplicável:

- elementos que constituem autorização/instrução;
- elementos obrigatórios de cotejamento;
- elementos informativos;
- informações que podem ser relevantes para o contexto;
- informações que não constituem uma autorização;
- situações em que uma informação passa a ser operacionalmente relevante por causa do contexto.

NÃO invente uma lista de campos obrigatórios.

Antes de alterar essa lógica:

1. procure a definição nos documentos/corpus existentes;
2. identifique qual documentação fundamenta a regra;
3. compare essa definição com o código atual;
4. somente então proponha a refatoração.

A estrutura de autorização pendente deve representar semanticamente o que realmente está pendente, em vez de depender de uma lista genérica fixa.

O planejamento deve considerar a separação entre:

- intenção;
- autorização;
- campos obrigatórios;
- campos informativos;
- origem documental;
- estado da autorização;
- cotejamento esperado;
- resposta recebida.

==================================================
13. MATRIZ DE REGRESSÃO
==================================================

A matriz de regressão NÃO é fonte de verdade regulatória.

Ela é uma ferramenta de TESTE.

A verdade operacional deve vir da documentação/corpus.

A matriz deve apenas representar cenários esperados com base nessas definições.

Ela deve testar diálogos completos, e não somente frases isoladas.

Deve ser possível representar:

- múltiplos turnos;
- mudanças de estado;
- perguntas;
- respostas;
- confirmações;
- solicitações;
- esclarecimentos;
- respostas inválidas;
- situações atípicas;
- emergências;
- mudanças de frequência;
- autorizações;
- cotejamentos;
- falhas de compreensão;
- recuperação após erro.

Os testes devem utilizar o mesmo pipeline real da aplicação.

Não crie um "caminho especial para os testes".

==================================================
14. NÃO TRANSFORMAR OS TESTES EM REGRA DE NEGÓCIO
==================================================

Não faça:

teste → comportamento esperado → implementação da regra.

Faça:

documentação/corpus → definição operacional → arquitetura → implementação → teste da definição.

Se houver divergência entre um teste existente e a documentação, o planejamento deve identificar a divergência.

Não simplesmente alterar a lógica para fazer o teste passar.

==================================================
15. MODELOS GRATUITOS
==================================================

O projeto possui uma política explícita de utilização de modelos gratuitos.

O planejamento deve respeitar SOMENTE os modelos/provedores gratuitos já previstos/configurados no projeto.

Não adicionar:

- modelos pagos;
- APIs pagas;
- novos provedores;
- novas credenciais;
- serviços que contrariem a política de custo zero.

Analise a implementação atual de:

server/model-registry.js
server/auto-free-provider.js

e demais módulos relacionados.

O sistema deve permitir:

- modelo preferencial;
- fallback automático;
- continuidade da sessão;
- preservação do contexto;
- preservação do estado;
- preservação do histórico relevante.

Se um modelo atingir limite, quota, timeout ou falhar, outro modelo gratuito configurado deve poder continuar a mesma sessão.

A troca de modelo NÃO pode significar começar uma conversa nova.

O estado da sessão deve permanecer externo ao modelo.

O novo modelo deve receber o contexto necessário para continuar de onde o anterior parou.

==================================================
16. CONTEXTO E TOKENS
==================================================

O planejamento deve considerar limites reais de contexto dos modelos configurados.

Não invente números de janela de contexto.

Pesquise/verifique os limites reais dos modelos efetivamente utilizados pelo projeto quando isso for necessário para o planejamento.

"Orçamento de tokens" neste projeto significa uma camada interna de proteção para evitar enviar contexto maior que a capacidade do modelo.

Não significa criar uma configuração manual complexa para o usuário.

O sistema deve ser capaz de:

- estimar o tamanho do contexto;
- reservar espaço para a resposta;
- evitar exceder a janela do modelo;
- selecionar um modelo alternativo quando necessário;
- reduzir/organizar contexto quando possível;
- preservar as informações essenciais da sessão.

O planejamento deve explicar como isso será feito sem destruir o contexto operacional.

==================================================
17. INTERFACE DE VOZ E voice.html
==================================================

O projeto possui atualmente uma interface oficial/documental e uma implementação paralela relacionada a voz:

- index.html
- web/app.js
- web/styles.css

e:

- voice.html
- src/App.jsx

A decisão arquitetural desejada é NÃO manter duas arquiteturas independentes para o mesmo produto.

Porém:

NÃO simplesmente apague voice.html/App.jsx.

Primeiro analise o que existe neles e identifique funcionalidades úteis que ainda não estejam incorporadas à interface oficial.

Essas funcionalidades devem ser incorporadas à arquitetura oficial quando fizerem sentido.

Somente depois disso deve ser planejada a descontinuação da implementação paralela.

O resultado final deve possuir uma única arquitetura oficial de aplicação.

==================================================
18. PTT E ESTADOS DE RÁDIO
==================================================

O comportamento de Push-To-Talk deve ser tratado como estado de rádio, não como exposição direta dos estados internos do pipeline.

A interface deve distinguir claramente estados como:

- LIVRE;
- TRANSMITINDO;
- RECEBENDO.

Estados internos como:

- recording;
- transcribing;
- interpreting;
- searching;
- responding;

não devem ser confundidos com o estado operacional do rádio.

O planejamento deve analisar:

- pointerup;
- pointercancel;
- pointerleave;
- perda de foco;
- interrupção;
- fim do TTS;
- erro do TTS;
- bloqueio do PTT enquanto o sistema estiver recebendo/respondendo;
- retorno seguro ao estado LIVRE.

==================================================
19. ARQUITETURA DESEJADA
==================================================

O planejamento deve buscar uma arquitetura aproximadamente conceitual como:

ENTRADA DO PILOTO
↓
STT
↓
NORMALIZAÇÃO
↓
INTERPRETAÇÃO DA COMUNICAÇÃO
↓
CONTEXTO + ESTADO DA SESSÃO
↓
RECUPERAÇÃO DE CONHECIMENTO
↓
EVIDÊNCIA DOCUMENTAL
↓
DECISÃO/CONTROLADOR OPERACIONAL
↓
ATUALIZAÇÃO VALIDADA DO ESTADO
↓
GERAÇÃO DA RESPOSTA
↓
NORMALIZAÇÃO DA SAÍDA
↓
TTS

O LLM deve funcionar como componente de interpretação/linguagem dentro dessa arquitetura.

Ele não deve se tornar a autoridade operacional do simulador.

==================================================
20. O QUE VOCÊ DEVE ANALISAR NO PROJETO
==================================================

Antes de montar o plano definitivo, analise o repositório atual, especialmente:

- atc-simulator-plano.md
- docs/ADR-001-LLM-FIRST.md
- docs/ADR-002-ZERO-COST.md
- docs/GERACAO_CORPUS.md
- docs/PIPELINE_CONTEXTUAL.md
- docs/PLANO-CORRECOES-2026-09.md
- src/
- server/
- web/
- index.html
- voice.html
- src/App.jsx
- testes existentes;
- corpus;
- mecanismos de retrieval;
- state machine;
- pipeline;
- treinamento/cotejamento;
- model registry;
- fallback;
- configuração de provedores.

Não presuma que o texto deste prompt está 100% atualizado em relação ao código.

Quando encontrar divergências, identifique-as.

O objetivo é justamente planejar a refatoração com base no estado real do projeto.

==================================================
21. O QUE VOCÊ DEVE ENTREGAR
==================================================

Produza um PLANO DE REFATORAÇÃO estruturado por fases.

Para cada fase informe:

1. objetivo;
2. problema atual;
3. comportamento final desejado;
4. componentes envolvidos;
5. arquivos/módulos provavelmente afetados;
6. dependências;
7. alterações arquiteturais necessárias;
8. riscos;
9. como validar;
10. critérios objetivos de conclusão.

O plano deve ser suficientemente detalhado para que outra IA/agente de código possa posteriormente executar a refatoração sem precisar reinventar a arquitetura.

Não escreva código de implementação nesta etapa.

==================================================
22. ORDEM DO PLANEJAMENTO
==================================================

A ordem das fases deve ser determinada pela dependência técnica real.

Como ponto de partida, considere a seguinte sequência conceitual:

FASE 0
Auditoria e confirmação do estado atual.

FASE 1
Arquitetura de conhecimento, interpretação contextual e diálogo.

FASE 2
Estado operacional, autorização e cotejamento.

FASE 3
Testes de diálogo e matriz de regressão.

FASE 4
PTT e estados da interface de rádio.

FASE 5
Modelos gratuitos, fallback e preservação de contexto.

FASE 6
Gestão de contexto/janela de tokens.

FASE 7
Unificação definitiva da interface e incorporação das funcionalidades úteis da implementação paralela.

FASE 8
Auditoria final e validação integrada.

PORÉM, NÃO considere essa ordem imutável.

Se a análise do projeto demonstrar que outra ordem é tecnicamente mais segura, explique a alteração e justifique-a.

==================================================
23. ENTREVISTA ANTES DO PLANO FINAL
==================================================

Depois de analisar o projeto e a documentação, NÃO faça perguntas desnecessárias.

Primeiro utilize tudo que já está definido neste prompt e nos documentos.

Somente faça perguntas ao usuário quando encontrar uma decisão que:

- não esteja definida na documentação;
- não possa ser determinada pelo código;
- tenha impacto arquitetural relevante;
- possa resultar em duas ou mais soluções materialmente diferentes;
- ou altere o comportamento final esperado do simulador.

Agrupe as perguntas.

Não faça uma pergunta por vez se várias puderem ser respondidas juntas.

Para cada pergunta, explique brevemente:

- qual decisão precisa ser tomada;
- por que ela importa;
- quais alternativas técnicas existem;
- qual parte do plano será afetada.

Não pergunte ao usuário aquilo que pode ser descoberto pela análise do repositório.

==================================================
24. NÃO IMPLEMENTAR PREMATURAMENTE
==================================================

Nesta etapa:

NÃO altere código.

NÃO crie arquivos.

NÃO faça commit.

NÃO "corrija" o projeto durante a análise.

NÃO implemente uma solução provisória só para demonstrar funcionamento.

Primeiro produza a análise e o plano.

Se precisar confirmar alguma informação com o usuário, interrompa a elaboração do plano final somente nesse ponto e apresente as decisões que precisam ser confirmadas.

==================================================
25. CRITÉRIO DE QUALIDADE DO PLANO
==================================================

O plano final deve demonstrar que você entendeu a diferença entre:

- resposta pré-programada;
- recuperação de conhecimento;
- interpretação semântica;
- contexto operacional;
- estado da sessão;
- regra documental;
- decisão operacional;
- geração linguística;
- teste de regressão.

O resultado desejado NÃO é um chatbot que apenas reconhece frases.

Também NÃO é um LLM livre que inventa respostas aeronáuticas.

É um simulador contextual em que:

- o usuário pode se expressar de maneiras diferentes;
- o sistema consegue compreender comunicações operacionalmente inteligíveis;
- o sistema mantém o contexto da conversa;
- o sistema sabe quando precisa perguntar;
- o sistema sabe quando uma resposta não responde à pergunta anterior;
- o sistema consegue lidar com situações incompletas;
- o sistema consegue continuar uma sequência de diálogo;
- o sistema utiliza o conhecimento documental aplicável;
- o sistema pode lidar com situações normais e atípicas;
- o sistema não depende de uma única resposta por situação;
- o sistema não inventa procedimentos;
- o estado operacional permanece controlado pela aplicação;
- modelos gratuitos podem ser substituídos sem perder a sessão;
- voz é apenas uma interface de entrada/saída;
- e a arquitetura permanece preparada para futuras fontes externas de informação.

==================================================
26. RESULTADO FINAL ESPERADO
==================================================

Ao terminar sua análise, apresente:

A. Diagnóstico arquitetural necessário para o planejamento.

B. Lacunas encontradas entre o comportamento atual e o comportamento desejado.

C. Decisões que já estão suficientemente definidas e NÃO precisam ser perguntadas ao usuário.

D. Decisões realmente pendentes que precisam ser confirmadas pelo usuário.

E. Plano de refatoração por fases.

F. Dependências entre as fases.

G. Critérios de validação de cada fase.

H. Estratégia de testes de diálogo.

I. Riscos e pontos de atenção.

J. Sequência recomendada para execução futura.

O plano deve ser orientado ao estado FINAL desejado do produto, e não simplesmente a uma lista das correções pontuais atualmente conhecidas.

Não trate os problemas atuais como pequenas correções isoladas se eles forem sintomas de uma deficiência arquitetural maior.

Ao mesmo tempo, não proponha reescrita completa sem necessidade.

A refatoração deve alterar aquilo que for necessário para alcançar o comportamento final definido neste documento, preservando aquilo que já funciona corretamente.