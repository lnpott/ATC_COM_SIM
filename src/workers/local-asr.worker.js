const MODEL = 'onnx-community/whisper-tiny'
let transcriber

self.onmessage = async ({ data }) => {
  const startedAt = performance.now()
  try {
    const { pipeline, env } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1')
    env.allowLocalModels = false
    const mode = self.navigator?.gpu ? 'webgpu' : 'wasm'
    transcriber ??= await pipeline('automatic-speech-recognition', MODEL, { device: mode, dtype: mode === 'webgpu' ? 'fp16' : 'q8' })
    const result = await transcriber(data.samples, { language: data.language === 'en' ? 'en' : 'pt', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 })
    self.postMessage({ transcript: String(result?.text ?? '').trim(), model: MODEL, mode: `local_${mode}`, latencyMs: Math.round(performance.now() - startedAt) })
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Falha no ASR local.' }) }
}
