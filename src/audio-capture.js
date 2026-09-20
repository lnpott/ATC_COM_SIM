const MIME_PREFERENCES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

export function selectRecordingMimeType(MediaRecorderImpl) {
  return MIME_PREFERENCES.find((mime) => MediaRecorderImpl?.isTypeSupported?.(mime)) ?? ''
}

export function createAudioCaptureSession({ scope = globalThis, onState, onError } = {}) {
  if (!scope.navigator?.mediaDevices?.getUserMedia || !scope.MediaRecorder) throw Object.assign(new Error('MediaRecorder não disponível.'), { code: 'audio_capture_error' })
  const id = scope.crypto?.randomUUID?.() ?? `audio-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const mimeType = selectRecordingMimeType(scope.MediaRecorder)
  let recorder; let stream; let stopRequested = false; let settled = false; let startedAt
  const chunks = []
  let resolveDone; let rejectDone
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject })

  async function start() {
    try {
      onState?.('requesting_microphone')
      stream = await scope.navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (settled) { stream.getTracks().forEach((track) => track.stop()); return }
      recorder = new scope.MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = ({ data }) => { if (data?.size) chunks.push(data) }
      recorder.onerror = (event) => fail(Object.assign(new Error('Falha durante captura de áudio.'), { code: 'audio_capture_error', cause: event?.error }))
      recorder.onstop = () => {
        if (settled) return
        settled = true
        const durationMs = Math.round((scope.performance?.now?.() ?? Date.now()) - startedAt)
        const blob = new scope.Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
        stream.getTracks().forEach((track) => track.stop())
        onState?.('captured')
        resolveDone({ id, blob, mimeType: blob.type, sizeBytes: blob.size, durationMs })
      }
      startedAt = scope.performance?.now?.() ?? Date.now()
      recorder.start(250)
      onState?.('recording')
      if (stopRequested) recorder.stop()
    } catch (cause) {
      const code = cause?.name === 'NotAllowedError' ? 'microphone_error' : 'audio_capture_error'
      fail(Object.assign(new Error(code === 'microphone_error' ? 'Permissão de microfone negada.' : 'Não foi possível capturar áudio.'), { code, cause }))
    }
  }

  function fail(error) {
    if (settled) return
    settled = true; stream?.getTracks?.().forEach((track) => track.stop()); onError?.(error); rejectDone(error)
  }

  function stop() {
    if (settled || stopRequested) return
    stopRequested = true
    if (recorder?.state === 'recording') recorder.stop()
  }

  function abort() { fail(Object.assign(new Error('Captura cancelada.'), { code: 'audio_capture_error' })); if (recorder?.state === 'recording') recorder.stop() }

  return { id, mimeType, done, start, stop, abort, get recorder() { return recorder } }
}
