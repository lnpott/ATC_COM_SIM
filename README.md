# ATC Voice Lab

Prova de conceito da **Fase 1** do simulador de comunicações com ATCOs: uma
única tela fecha o ciclo microfone → transcrição → resposta → voz usando a Web
Speech API.

## Executar localmente

```bash
npm install
cp .env.example .env
npm run dev
```

Abra o endereço exibido pelo Vite em uma versão recente do Chrome ou Edge,
permita o uso do microfone e mantenha o botão PTT pressionado enquanto fala.

Por padrão, `LLM_PROVIDER=mock` oferece uma resposta local no servidor para que
o fluxo possa ser demonstrado sem credenciais. Para usar um provedor remoto,
configure `LLM_PROVIDER` como `groq` ou `gemini` e preencha, no ambiente do
servidor, a chave e o modelo correspondentes listados em `.env.example`.

## Arquitetura desta fase

- `src/services/generateReply.js` é a interface independente de provedor usada
  pela tela. Ela chama somente `/api/generate-reply`.
- `server/providers.js` contém os adaptadores server-side; nenhuma credencial é
  exposta por variáveis `VITE_*` ou incluída no bundle do navegador.
- `api/generate-reply.js` expõe a função para hospedagens compatíveis com
  funções serverless, enquanto o plugin em `vite.config.js` oferece a mesma rota
  durante o desenvolvimento.
- O índice documental e a máquina de estados estão deliberadamente fora desta
  fase. `atc-simulator-chunks.json` e `atc-simulator-index.json` permanecem na
  raiz apenas como artefatos de referência, sem serem importados pelo app.

## Build

```bash
npm run build
npm run preview
```

> Esta aplicação é uma demonstração técnica e não deve ser usada em operações
> aeronáuticas reais.


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
