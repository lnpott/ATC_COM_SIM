import { expandForSpeech } from './normalization.js';

export function createBrowserRecognizer({ idioma = 'pt', onResult, scope = globalThis } = {}) {
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (!Recognition) throw new Error('SpeechRecognition não está disponível neste navegador.');
  if (typeof onResult !== 'function') throw new TypeError('onResult deve ser uma função.');
  const recognition = new Recognition();
  recognition.lang = idioma === 'en' ? 'en-US' : 'pt-BR';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onresult = (event) => onResult(event.results[event.resultIndex][0].transcript);
  return recognition;
}

export function speakTransmission(text, { idioma = 'pt', scope = globalThis } = {}) {
  if (!scope.speechSynthesis || !scope.SpeechSynthesisUtterance) {
    throw new Error('speechSynthesis não está disponível neste navegador.');
  }
  const utterance = new scope.SpeechSynthesisUtterance(expandForSpeech(text, idioma));
  utterance.lang = idioma === 'en' ? 'en-US' : 'pt-BR';
  scope.speechSynthesis.speak(utterance);
  return utterance;
}
