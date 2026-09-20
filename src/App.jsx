import { useEffect, useRef, useState } from 'react'
import { generateReply } from './services/generateReply.js'
import { createRecognitionSession, speakTransmission } from './speech.js'

const copy = {
  'pt-BR': {
    eyebrow: 'LABORATÓRIO DE COMUNICAÇÃO', title: 'ATC Voice Lab', subtitle: 'Prova de conceito · Fase 1',
    ptt: 'PRESSIONE PARA FALAR', listening: 'ESCUTANDO…', processing: 'PROCESSANDO…', speaking: 'TRANSMITINDO…',
    idle: 'Frequência livre', listeningHint: 'Fale agora e solte quando terminar', processingHint: 'Gerando resposta do controlador', speakingHint: 'Reproduzindo resposta por voz',
    transcript: 'SUA TRANSMISSÃO', response: 'RESPOSTA DO CONTROLADOR', emptyTranscript: 'Sua frase reconhecida aparecerá aqui.', emptyResponse: 'A resposta será reproduzida e exibida aqui.',
    unsupported: 'Este navegador não oferece suporte completo à Web Speech API. Use uma versão recente do Chrome ou Edge com microfone habilitado.',
    permission: 'Não foi possível acessar o microfone. Verifique a permissão do navegador.', language: 'Idioma da frequência', live: 'CANAL ATIVO', footer: 'DEMONSTRAÇÃO — NÃO USE PARA OPERAÇÕES REAIS',
  },
  'en-US': {
    eyebrow: 'COMMUNICATION LAB', title: 'ATC Voice Lab', subtitle: 'Proof of concept · Phase 1',
    ptt: 'PUSH TO TALK', listening: 'LISTENING…', processing: 'PROCESSING…', speaking: 'TRANSMITTING…',
    idle: 'Frequency clear', listeningHint: 'Speak now and release when finished', processingHint: 'Generating controller response', speakingHint: 'Playing voice response',
    transcript: 'YOUR TRANSMISSION', response: 'CONTROLLER RESPONSE', emptyTranscript: 'Your recognized phrase will appear here.', emptyResponse: 'The response will be played and shown here.',
    unsupported: 'This browser does not fully support the Web Speech API. Use a recent Chrome or Edge version with microphone access enabled.',
    permission: 'Microphone access failed. Check your browser permission.', language: 'Frequency language', live: 'CHANNEL ACTIVE', footer: 'DEMONSTRATION — NOT FOR REAL-WORLD OPERATIONS',
  },
}

export default function App() {
  const [language, setLanguage] = useState('pt-BR')
  const [status, setStatus] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const recognitionRef = useRef(null)
  const historyRef = useRef([])
  const t = copy[language]
  const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const speechSupported = Boolean(Recognition && window.speechSynthesis)

  useEffect(() => () => {
    recognitionRef.current?.abort()
    window.speechSynthesis?.cancel()
  }, [])

  function speak(text) {
    return new Promise((resolve) => {
      speakTransmission(text, { idioma: language, scope: window, onEnd: resolve, onError: resolve })
    })
  }

  async function handleResult(text) {
    setTranscript(text)
    setStatus('processing')
    try {
      const messages = [...historyRef.current, { role: 'user', content: text }]
      const answer = await generateReply(messages, { language })
      setReply(answer)
      historyRef.current = [...messages, { role: 'assistant', content: answer }].slice(-8)
      setStatus('speaking')
      await speak(answer)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.permission)
    } finally {
      setStatus('idle')
    }
  }

  function startListening() {
    if (!speechSupported || status !== 'idle') return
    setError('')
    setReply('')
    let submitted = false
    const session = createRecognitionSession({
      idioma: language,
      scope: window,
      onInterim: setTranscript,
      onFinal: (text) => { submitted = true; handleResult(text); },
      onError: () => { setError(t.permission); setStatus('idle'); },
      onEnd: () => { recognitionRef.current = null; if (!submitted) setStatus('idle'); },
    })
    recognitionRef.current = session
    setStatus('listening')
    session.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
  }

  const labels = { idle: t.ptt, listening: t.listening, processing: t.processing, speaking: t.speaking }
  const hints = { idle: t.idle, listening: t.listeningHint, processing: t.processingHint, speaking: t.speakingHint }

  return (
    <main className="app-shell">
      <div className="top-line" />
      <header>
        <div className="brand">
          <img src="/radio-mark.svg" alt="" />
          <div><p>{t.eyebrow}</p><h1>{t.title}</h1></div>
        </div>
        <div className="channel"><span className="pulse" /> {t.live} <strong>118.70</strong></div>
      </header>

      <section className="hero">
        <div className="intro"><span>01 / VOICE LOOP</span><h2>{t.subtitle}</h2></div>
        <div className="language" aria-label={t.language}>
          <span>{t.language}</span>
          <div className="segmented">
            {['pt-BR', 'en-US'].map((lang) => <button key={lang} className={language === lang ? 'active' : ''} onClick={() => setLanguage(lang)} disabled={status !== 'idle'}>{lang}</button>)}
          </div>
        </div>
      </section>

      {!speechSupported && <div className="warning" role="alert"><b>WEB SPEECH API</b><span>{t.unsupported}</span></div>}
      {error && <div className="warning error" role="alert"><b>ALERTA</b><span>{error}</span></div>}

      <section className="console">
        <div className="ptt-zone">
          <div className={`radar radar-${status}`}>
            <i /><i /><i />
            <button
              className={`ptt ptt-${status}`}
              onPointerDown={startListening}
              onPointerUp={stopListening}
              onPointerLeave={stopListening}
              disabled={!speechSupported || !['idle', 'listening'].includes(status)}
              aria-label={labels[status]}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a4 4 0 0 0 4-4V5a4 4 0 1 0-8 0v6a4 4 0 0 0 4 4Zm-7-4a7 7 0 0 0 14 0M12 18v4m-4 0h8" /></svg>
              <strong>{labels[status]}</strong>
            </button>
          </div>
          <div className={`status status-${status}`}><span /> {hints[status]}</div>
        </div>

        <div className="readouts">
          <article><div className="readout-head"><span>{t.transcript}</span><small>RX</small></div><p className={transcript ? '' : 'placeholder'}>{transcript || t.emptyTranscript}</p></article>
          <article><div className="readout-head"><span>{t.response}</span><small>TX</small></div><p className={reply ? '' : 'placeholder'}>{reply || t.emptyResponse}</p></article>
        </div>
      </section>

      <footer><span>ATC / POC-01</span><span>{t.footer}</span><span>WEB SPEECH API</span></footer>
    </main>
  )
}
