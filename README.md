# ATC_COM_SIM

Simulador de comunicações com ATCOs.

## Geração do corpus e do índice

O procedimento operacional completo, incluindo pré-requisitos, inspeção das
alterações, testes e solução de erros, está em
[`docs/GERACAO_CORPUS.md`](docs/GERACAO_CORPUS.md).

Use Python 3 (sem dependências externas) para regenerar **os dois artefatos juntos**:

```bash
python3 scripts/generate_corpus.py
```

O comando normaliza os chunks, valida o resultado em memória e só então substitui
`atc-simulator-chunks.json` e `atc-simulator-index.json`. Para conferir artefatos já
gerados sem modificá-los, execute:

```bash
python3 scripts/generate_corpus.py --validate-only
```

Os IDs seguem a convenção estável
`<documento>-<tipo-segmento>-<numero>-<segmento>` (por exemplo,
`MCA-100-16-artigo-0003-001`). Os campos `documento`, `artigo`, `secao` e
`posicao_original` permanecem separados; `doc` continua disponível por
compatibilidade. O segmento distingue materiais preliminares, anexos, tabelas e
partes diferentes associadas ao mesmo artigo.

A validação encerra com erro se houver IDs duplicados, contagem divergente em
`metadados.n_chunks`, referência do índice a ID inexistente ou chunk sem
`documento`, `versao`, `tipo`, `idioma`, `fases` ou `texto`.
