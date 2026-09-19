import { createGroundedControllerReply, detectIntent, searchPhaseForIntent } from '../src/controller.js';
import { normalizePhraseology } from '../src/normalization.js';
import { getScenario } from '../src/scenarios.js';
import { ManualSearch } from '../src/search.js';
import { createBrowserRecognizer, speakTransmission } from '../src/speech.js';
import { applyStateUpdate, createSimulationState, recordTransmission } from '../src/state-machine.js';
import { buildSessionReport, evaluateReadback } from '../src/training.js';

const $ = (selector) => document.querySelector(selector);
let search;
let state;
let idioma;
let lastClearance = null;
let evaluations = [];
let voiceEnabled = true;

function startScenario() {
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
  if (!search || !rawText.trim()) return;
  const text = normalizePhraseology(rawText);
  if (lastClearance) evaluations.push(evaluateReadback({ autorizacao: lastClearance, cotejamento: text }));
  state = recordTransmission(state, { origem: 'piloto', texto: text });
  addMessage('pilot', text);
  const phase = searchPhaseForIntent(detectIntent(text), state.fase === 'encerrado' ? 'solo' : state.fase);
  const results = search.search({ texto: text, idioma, fase_de_voo: phase, limite: 8 });
  const reply = createGroundedControllerReply({ text, idioma, state, searchResults: results });
  if (!reply.covered) {
    addMessage('atco', reply.spokenText, true); renderEvidence(null); renderScore(); return;
  }
  if (reply.stateUpdate) state = applyStateUpdate(state, reply.stateUpdate);
  state = recordTransmission(state, { origem: 'atco', texto: reply.spokenText, fontes: reply.sourceIds });
  lastClearance = reply.spokenText;
  addMessage('atco', reply.spokenText); renderEvidence(reply.source); renderState(); renderScore();
  if (voiceEnabled) try { speakTransmission(reply.spokenText, { idioma }); } catch { /* UI remains usable without TTS. */ }
}

$('#transmission-form').addEventListener('submit', (event) => { event.preventDefault(); const input = $('#transmission'); transmit(input.value); input.value = ''; });
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { $('#transmission').value = button.dataset.prompt; $('#transmission').focus(); }));
$('#scenario').addEventListener('change', startScenario);
$('#new-session').addEventListener('click', startScenario);
$('#sound-toggle').addEventListener('click', () => { voiceEnabled = !voiceEnabled; $('#sound-toggle').textContent = voiceEnabled ? '◉ VOZ' : '○ MUDO'; });
$('#ptt').addEventListener('click', () => {
  const button = $('#ptt');
  try {
    const recognition = createBrowserRecognizer({ idioma, onResult: (text) => { button.classList.remove('listening'); $('#transmission').value = text; transmit(text); } });
    recognition.onerror = () => button.classList.remove('listening'); recognition.onend = () => button.classList.remove('listening');
    button.classList.add('listening'); recognition.start();
  } catch (error) { addMessage('atco', error.message, true); }
});

try {
  search = await ManualSearch.load(new URL('../atc-simulator-index.json', import.meta.url));
  $('#system-status').classList.add('ready'); $('#system-status').innerHTML = '<span></span> ÍNDICE ONLINE · 374 TRECHOS';
  startScenario();
} catch (error) {
  $('#system-status').textContent = `Falha: ${error.message}`;
}
