# Procedimento de geração e validação do corpus

Este é o procedimento operacional, passo a passo, para manter
`atc-simulator-chunks.json` e `atc-simulator-index.json`. Os dois arquivos são um
único conjunto versionado: nunca se deve editar ou publicar apenas um deles.

## 1. Confirmar o estado do repositório

Na raiz do projeto, execute:

```bash
git status --short --branch
git log --oneline --decorate -5
git remote -v
```

Antes de gerar, a árvore de trabalho deve estar limpa ou as alterações locais
devem ser conhecidas. Se `git remote -v` não mostrar uma origem, só é possível
confirmar que a cópia **local** é a mais recente; não é possível compará-la com
um repositório central. Se houver uma origem configurada, atualize as referências
remotas de acordo com o fluxo de branches adotado pelo projeto antes de continuar.

## 2. Conferir os pré-requisitos

O gerador requer somente Python 3 e utiliza exclusivamente a biblioteca padrão:

```bash
python3 --version
python3 -m py_compile scripts/generate_corpus.py
```

O arquivo `atc-simulator-chunks.json` existente é a entrada do processo. Cada
chunk precisa conter dados utilizáveis para `documento` (ou o campo legado
`doc`), `versao`, `tipo`, `idioma`, `fases` e `texto`.

## 3. Gerar os dois artefatos

Execute uma única vez:

```bash
python3 scripts/generate_corpus.py
```

O gerador realiza, nesta ordem:

1. lê os chunks existentes;
2. identifica o tipo estrutural (`preliminar`, `anexo`, `tabela` ou `artigo`);
3. atribui o ID `<documento>-<tipo-segmento>-<numero>-<segmento>`;
4. preserva separadamente documento, artigo, seção e posição original;
5. recria tokens, IDF, metadados e a cópia de chunks do índice;
6. valida os dois resultados ainda em memória;
7. grava arquivos temporários; e
8. substitui os dois artefatos somente depois da geração bem-sucedida.

Não execute ferramentas diferentes para atualizar cada JSON. O comando acima é
o ponto único de geração.

## 4. Validar o resultado salvo

Execute a validação independente, sem alterar arquivos:

```bash
python3 scripts/generate_corpus.py --validate-only
```

O comando termina com código diferente de zero se detectar:

- IDs repetidos;
- `metadados.n_chunks` diferente da quantidade de chunks;
- um ID usado pelo índice que não existe no corpus; ou
- chunk sem `documento`, `versao`, `tipo`, `idioma`, `fases` ou `texto`.

## 5. Inspecionar o diff

Confira tanto o resumo quanto a ausência de erros de whitespace:

```bash
git diff --stat
git diff --check
git status --short
```

Em uma revisão de conteúdo, confirme especialmente:

- que material preliminar não recebeu ID de artigo;
- que segmentos do mesmo artigo têm sufixos `-001`, `-002` e assim por diante;
- que `documento`, `artigo`, `secao` e `posicao_original` continuam presentes;
- que `atc-simulator-chunks.json` e `atc-simulator-index.json` aparecem juntos
  no diff; e
- que uma segunda execução do gerador não produz novas alterações.

Para verificar a última condição:

```bash
sha256sum atc-simulator-chunks.json atc-simulator-index.json > /tmp/atc-antes.sha256
python3 scripts/generate_corpus.py
sha256sum atc-simulator-chunks.json atc-simulator-index.json > /tmp/atc-depois.sha256
diff -u /tmp/atc-antes.sha256 /tmp/atc-depois.sha256
```

Uma saída vazia de `diff` confirma que a segunda geração foi determinística.

## 6. Registrar a alteração

Depois de revisar os arquivos e executar a validação:

```bash
git add README.md docs/GERACAO_CORPUS.md scripts/generate_corpus.py \
  atc-simulator-chunks.json atc-simulator-index.json
git commit -m "Atualiza corpus e índice ATC"
```

Abra então um pull request com o commit. A descrição deve mencionar a origem da
mudança nos chunks e registrar os comandos de geração e validação executados.

## Solução de problemas

### `IDs duplicados`

Confirme o tipo estrutural, o número e a ordem dos chunks conflitantes. Não
resolva a falha alterando manualmente apenas o ID no índice; corrija os dados do
chunk ou a normalização e regenere ambos os artefatos.

### `metadados.n_chunks` difere

O índice provavelmente não corresponde ao corpus atual. Execute novamente o
comando de geração, nunca ajuste a contagem manualmente.

### `indice referencia IDs inexistentes`

Há mistura de versões dos dois JSONs. Restaure um par consistente e execute o
gerador para recriá-los juntos.

### Campo obrigatório ausente

Corrija o chunk indicado na mensagem. Listas vazias em `fases` e strings vazias
também são consideradas ausentes.
