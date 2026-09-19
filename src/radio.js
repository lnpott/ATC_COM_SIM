export function createRadioChain(audioContext, destination = audioContext.destination) {
  const input = audioContext.createGain();
  const highpass = audioContext.createBiquadFilter();
  const lowpass = audioContext.createBiquadFilter();
  const compressor = audioContext.createDynamicsCompressor();
  highpass.type = 'highpass'; highpass.frequency.value = 300;
  lowpass.type = 'lowpass'; lowpass.frequency.value = 3400;
  compressor.threshold.value = -24; compressor.ratio.value = 6;
  input.connect(highpass).connect(lowpass).connect(compressor).connect(destination);
  return { input, output: compressor, disconnect: () => input.disconnect() };
}

export class TransmissionQueue {
  #tail = Promise.resolve();
  enqueue(play) {
    if (typeof play !== 'function') throw new TypeError('play deve ser uma função.');
    const scheduled = this.#tail.then(play);
    this.#tail = scheduled.catch(() => undefined);
    return scheduled;
  }
}
