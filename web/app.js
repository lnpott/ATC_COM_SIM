import { normalizePhraseology } from '../src/normalization.js';
import { processTransmission } from '../src/pipeline.js';
import { getScenario } from '../src/scenarios.js';
import { ManualSearch } from '../src/search.js';
import { createRecognitionSession, speakTransmission } from '../src/speech.js';
import { createAudioCaptureSession } from '../src/audio-capture.js';
import { limitedSessionContext } from '../src/llm/semantic-interpreter.js';
import { requestSemanticInterpretation } from '../src/services/interpretTransmission.js';
import { transcribeAudioFree } from '../src/services/transcribeAudio.js';
import { applyStateUpdate, createSimulationState, recordTransmission } from '../src/state-machine.js';
import { buildSessionReport, evaluateReadback } from '../src/training.js';

const $ = (selector) => document.querySelector(selector);
let search;
let state;
let idioma;
let lastClearance = null;
let evaluations = [];
let voiceEnabled = true;
let recognitionSession = null;
let pttOperation = null;
let transmissionInFlight = false;
let sessionId = crypto.randomUUID();
const processedPttSessions = new Set();
const diagnosticMode = new URLSearchParams(location.search).has('debug');
if (diagnosticMode) window.__ATC_DEBUG__ = [];

const pttLabels = { recording: 'TRANSMITINDO…', transcribing: 'TRANSCREVENDO…', interpreting: 'INTERPRETANDO…', searching: 'BUSCANDO DOCUMENTAÇÃO…', responding: 'RESPONDENDO…' };
function setPttState(name = '') { const button = $('#ptt'); button.dataset.state = name; button.querySelector('small').textContent = pttLabels[name] ?? 'PRESSIONE PARA FALAR'; }

function startScenario() {
  recognitionSession?.abort();
  recognitionSession = null;
  const config = getScenario($('#scenario').value);
  idioma = config.idioma;
  state = createSimulationState(config);
  sessionId = crypto.randomUUID();
  processedPttSessions.clear();
  lastClearance = null; evaluations = [];
  $('#transcript').innerHTML = '<div class="empty"><span>⌁</span><strong>Frequência livre</strong><p>Use uma sugestão ou pressione o PTT para iniciar.</p></div>';
  $('#evidence').className = 'evidence-empty';
  $('#evidence').innerHTML = '<span>◎</span><p>As fontes da última resposta aparecerão aqui.</p>';
  renderState(); renderScore();
}

function renderState() {
  $('#strip-call-sign').textContent = state.aeronave.indicativo;
  $('#strip-phase').textContent = state.fase.toUpperCase();
  $('#strip-runway').textContent = state.cenario.pista_em_uso;
  $('#strip-qnh').textContent = state.cenario.qnh;
  $('#frequency').textContent = state.frequencia.toUpperCase();
}

function addMessage(origin, text, error = false) {
  $('.empty')?.remove();
  const article = document.createElement('article');
  article.className = `message ${origin} ${error ? 'error' : ''}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  article.innerHTML = `<header><span>${origin === 'atco' ? 'CONTROLADOR' : 'PILOTO'}</span><time>${time}Z</time></header><p></p>`;
  article.querySelector('p').textContent = text;
  $('#transcript').append(article);
  $('#transcript').scrollTop = $('#transcript').scrollHeight;
}

function renderEvidence(result) {
  $('#evidence').className = '';
  $('#evidence').innerHTML = result ? `<article class="source-card"><small>${result.id}</small><strong>${result.documento} · ${result.artigo}</strong><p></p></article>` : '<div class="evidence-empty"><span>⊘</span><p>Nenhuma evidência documental encontrada.</p></div>';
  if (result) $('#evidence p').textContent = result.texto;
}

function renderScore() {
  const report = buildSessionReport(state?.historico ?? [], evaluations);
  $('#score').textContent = report.score;
  $('#score-bar').style.width = `${report.score}%`;
  $('#score-detail').textContent = evaluations.length ? `${evaluations.length} cotejamento(s) · ${Object.keys(report.erros_recorrentes).length} tipo(s) de omissão` : 'Nenhum cotejamento avaliado.';
}

async function transmit(rawText, { pttSessionId = null, sttCompletionMs = null, audioMeta = null, sttMeta = null, totalStartedAt = null } = {}) {
  if (!search || !rawText.trim() || transmissionInFlight) return;
  if (pttSessionId && processedPttSessions.has(pttSessionId)) return;
  if (pttSessionId) processedPttSessions.add(pttSessionId);
  transmissionInFlight = true;
  try {
  const text = normalizePhraseology(rawText);
  const sessionContext = limitedSessionContext(state);
  if (lastClearance) evaluations.push(evaluateReadback({ autorizacao: lastClearance, cotejamento: text }));
  state = recordTransmission(state, { origem: 'piloto', texto: text });
  addMessage('pilot', text);
  let semantic;
  if (pttSessionId) setPttState('interpreting');
  try {
    semantic = await requestSemanticInterpretation({
      rawTranscript: rawText, normalizedTranscript: text,
      language: idioma, sessionContext,
      scenarioContext: { airport: state.cenario.aerodromo, runway: state.cenario.pista_em_uso, qnh: state.cenario.qnh, phase: state.fase },
    });
  } catch (error) {
    semantic = { error: error.code ?? 'llm_unavailable' };
  }
  if (pttSessionId) setPttState('searching');
  const { decision: reply, diagnostics } = processTransmission({
    text: rawText, idioma, state, search, debug: diagnosticMode,
    interpretation: semantic.pipelineInterpretation,
    semanticMeta: semantic.pipelineInterpretation ? { ...semantic, sessionContextUsed: sessionContext } : { provider: 'gemini', model: null, error: semantic.error, sessionContextUsed: sessionContext },
    sessionId, pttSessionId, sttCompletionMs, audioMeta, sttMeta, totalStartedAt,
  });
  if (pttSessionId) setPttState('responding');
  if (diagnostics) window.__ATC_DEBUG__.push(diagnostics);
  if (!reply.covered) {
    addMessage('atco', reply.spokenText, reply.status === 'unsupported'); renderEvidence(null); renderScore(); return;
  }
  if (reply.stateUpdate) state = applyStateUpdate(state, reply.stateUpdate);
  state = recordTransmission(state, { origem: 'atco', texto: reply.spokenText, fontes: reply.sourceIds });
  lastClearance = reply.spokenText;
  addMessage('atco', reply.spokenText); renderEvidence(reply.source); renderState(); renderScore();
  if (voiceEnabled) try { speakTransmission(reply.spokenText, { idioma }); } catch { /* UI remains usable without TTS. */ }
  } finally {
    transmissionInFlight = false;
  }
}

function startPtt() {
  if (pttOperation || recognitionSession || transmissionInFlight) return;
  const button = $('#ptt');
  try {
    const pttSessionId = crypto.randomUUID();
    let webSpeechTranscript = '';
    let webSpeechResolve;
    const webSpeechDone = new Promise((resolve) => { webSpeechResolve = resolve; });
    const capture = createAudioCaptureSession({ onState: (stateName) => { if (stateName === 'recording') setPttState('recording'); } });
    capture.done.catch(() => {});
    const session = createRecognitionSession({
      idioma, sessionId: pttSessionId,
      onInterim: (text, meta) => { if (recognitionSession?.id === meta.sessionId) $('#transmission').value = text; },
      onFinal: (text, meta) => { if (recognitionSession?.id === meta.sessionId) { webSpeechTranscript = text; $('#transmission').value = text; } },
      onError: (event) => { if (event?.error !== 'aborted') webSpeechResolve({ transcript: '', error: 'stt_error' }); },
      onEnd: (meta) => { webSpeechResolve({ transcript: webSpeechTranscript, latencyMs: meta.sttCompletionMs }); if (recognitionSession?.id === meta.sessionId) recognitionSession = null; },
    });
    recognitionSession = session;
    pttOperation = { id: pttSessionId, capture, webSpeechDone, startedAt: performance.now(), stopping: false };
    button.classList.add('listening');
    setPttState('recording');
    capture.start();
    recognitionSession.start();
  } catch (error) {
    recognitionSession = null; pttOperation = null;
    button.classList.remove('listening');
    addMessage('atco', error.message, true);
  }
}

function stopPtt() {
  const operation = pttOperation;
  if (!operation || operation.stopping) return;
  operation.stopping = true;
  const button = $('#ptt'); setPttState('transcribing');
  recognitionSession?.stop(); operation.capture.stop();
  Promise.allSettled([operation.capture.done, operation.webSpeechDone]).then(async ([audioResult, speechResult]) => {
    if (pttOperation?.id !== operation.id) return;
    try {
      if (audioResult.status !== 'fulfilled') throw audioResult.reason;
      const audioMeta = audioResult.value;
      const web = speechResult.status === 'fulfilled' ? speechResult.value : {};
      const sttMeta = await transcribeAudioFree({ blob: audioMeta.blob, language: idioma, webSpeechTranscript: web.transcript, timings: { webSpeechLatencyMs: web.latencyMs } });
      if (pttOperation?.id !== operation.id) return;
      $('#transmission').value = sttMeta.transcript;
      setPttState('interpreting');
      await transmit(sttMeta.transcript, { pttSessionId: operation.id, sttCompletionMs: sttMeta.latencyMs, audioMeta, sttMeta, totalStartedAt: operation.startedAt });
    } catch (error) {
      if (diagnosticMode) window.__ATC_DEBUG__.push({ sessionId, pttSessionId: operation.id, stage: 'stt', errorCode: error.code ?? 'stt_error', failures: error.failures ?? [] });
      addMessage('atco', error.code === 'microphone_error' ? 'Permissão de microfone negada.' : 'Nenhum STT gratuito conseguiu transcrever a gravação.', true);
    }
    finally { if (pttOperation?.id === operation.id) pttOperation = null; button.classList.remove('listening'); setPttState(); }
  });
}

$('#transmission-form').addEventListener('submit', (event) => { event.preventDefault(); const input = $('#transmission'); transmit(input.value); input.value = ''; });
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { $('#transmission').value = button.dataset.prompt; $('#transmission').focus(); }));
$('#scenario').addEventListener('change', startScenario);
$('#new-session').addEventListener('click', startScenario);
$('#sound-toggle').addEventListener('click', () => { voiceEnabled = !voiceEnabled; $('#sound-toggle').textContent = voiceEnabled ? '◉ VOZ' : '○ MUDO'; });
$('#ptt').addEventListener('pointerdown', (event) => { event.preventDefault(); startPtt(); });
$('#ptt').addEventListener('pointerup', stopPtt);
$('#ptt').addEventListener('pointercancel', stopPtt);
$('#ptt').addEventListener('click', (event) => { if (event.detail === 0) recognitionSession ? stopPtt() : startPtt(); });

try {
  search = await ManualSearch.load(new URL('../atc-simulator-index.json', import.meta.url));
  $('#system-status').classList.add('ready'); $('#system-status').innerHTML = '<span></span> ÍNDICE ONLINE · 374 TRECHOS';
  startScenario();
} catch (error) {
  $('#system-status').textContent = `Falha: ${error.message}`;
}
