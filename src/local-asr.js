const WORKER_URL = new URL('./workers/local-asr.worker.js', import.meta.url)

async function audioSamples(blob, scope) {
  const context = new scope.AudioContext({ sampleRate: 16_000 })
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const length = Math.ceil(decoded.duration * 16_000)
    const offline = new scope.OfflineAudioContext(1, length, 16_000)
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start()
    return (await offline.startRendering()).getChannelData(0)
  } finally { await context.close() }
}

export async function transcribeLocalAudio(blob, { language = 'pt', scope = globalThis, timeoutMs = 45_000, WorkerImpl = scope.Worker } = {}) {
  if (!WorkerImpl || !scope.AudioContext || !scope.OfflineAudioContext) throw Object.assign(new Error('ASR local indisponível.'), { code: 'local_asr_error' })
  const samples = await audioSamples(blob, scope)
  const worker = new WorkerImpl(WORKER_URL, { type: 'module' })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(reject, Object.assign(new Error('ASR local excedeu o tempo limite.'), { code: 'stt_timeout' })), timeoutMs)
    const finish = (callback, value) => { clearTimeout(timer); worker.terminate(); callback(value) }
    worker.onmessage = ({ data }) => data?.error ? finish(reject, Object.assign(new Error(data.error), { code: 'local_asr_error' })) : finish(resolve, { transcript: data.transcript, provider: 'local', model: data.model, mode: data.mode, latencyMs: data.latencyMs })
    worker.onerror = () => finish(reject, Object.assign(new Error('Worker ASR local falhou.'), { code: 'local_asr_error' }))
    worker.postMessage({ samples, language }, [samples.buffer])
  })
}
