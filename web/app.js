import { normalizePhraseology } from '../src/normalization.js';
import { processTransmission } from '../src/pipeline.js';
import { getScenario } from '../src/scenarios.js';
import { ManualSearch } from '../src/search.js';
import { createRecognitionSession, speakTransmission } from '../src/speech.js';
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
let transmissionInFlight = false;
const diagnosticMode = new URLSearchParams(location.search).has('debug');
if (diagnosticMode) window.__ATC_DEBUG__ = [];

function startScenario() {
  recognitionSession?.abort();
  recognitionSession = null;
  const config = getScenario($('#scenario').value);
  idioma = config.idioma;
  state = createSimulationState(config);
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

async function transmit(rawText) {
  if (!search || !rawText.trim() || transmissionInFlight) return;
  transmissionInFlight = true;
  try {
  const text = normalizePhraseology(rawText);
  if (lastClearance) evaluations.push(evaluateReadback({ autorizacao: lastClearance, cotejamento: text }));
  state = recordTransmission(state, { origem: 'piloto', texto: text });
  addMessage('pilot', text);
  const { decision: reply, diagnostics } = processTransmission({ text: rawText, idioma, state, search, debug: diagnosticMode });
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
  if (recognitionSession || transmissionInFlight) return;
  const button = $('#ptt');
  try {
    recognitionSession = createRecognitionSession({
      idioma,
      onInterim: (text) => { $('#transmission').value = text; },
      onFinal: (text) => { $('#transmission').value = text; transmit(text); },
      onError: () => addMessage('atco', 'Não foi possível concluir o reconhecimento de voz.', true),
      onEnd: () => { recognitionSession = null; button.classList.remove('listening'); },
    });
    button.classList.add('listening');
    recognitionSession.start();
  } catch (error) {
    recognitionSession = null;
    button.classList.remove('listening');
    addMessage('atco', error.message, true);
  }
}

function stopPtt() {
  recognitionSession?.stop();
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
