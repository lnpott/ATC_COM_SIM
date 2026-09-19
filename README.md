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
