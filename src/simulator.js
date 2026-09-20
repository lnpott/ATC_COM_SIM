import { buildGroundedRequest, validateGroundedReply } from './grounding.js';
import { normalizePhraseology } from './normalization.js';
import { getScenario } from './scenarios.js';
import { applyStateUpdate, createSimulationState, recordTransmission } from './state-machine.js';
import { processTransmission } from './pipeline.js';

/** Coordinates deterministic layers but intentionally leaves STT, LLM and TTS as adapters. */
export class SimulatorSession {
  constructor({ search, scenario = 'vfr_local_pt' }) {
    if (!search?.search) throw new TypeError('search é obrigatório.');
    this.search = search;
    const configuration = getScenario(scenario);
    this.idioma = configuration.idioma;
    this.state = createSimulationState(configuration);
  }

  prepareTransmission(rawText) {
    const texto = normalizePhraseology(rawText);
    this.state = recordTransmission(this.state, { origem: 'piloto', texto });
    const fase_de_voo = this.state.fase === 'encerrado' ? 'solo' : this.state.fase;
    const resultados = this.search.search({ texto, idioma: this.idioma, fase_de_voo });
    return buildGroundedRequest({ texto, idioma: this.idioma, estado: this.state, resultados });
  }

  acceptReply(reply, request) {
    const validated = validateGroundedReply(reply, request);
    if (validated.atualizacao_estado) {
      this.state = applyStateUpdate(this.state, validated.atualizacao_estado);
    }
    this.state = recordTransmission(this.state, { origem: 'atco', texto: validated.texto_falado, fontes: validated.ids_fontes });
    return validated.texto_falado;
  }

  /** Runs the deterministic production pipeline and applies only its validated update. */
  process(rawText, { debug = false } = {}) {
    this.state = recordTransmission(this.state, { origem: 'piloto', texto: normalizePhraseology(rawText) });
    const result = processTransmission({ text: rawText, idioma: this.idioma, state: this.state, search: this.search, debug });
    if (result.decision.stateUpdate) this.state = applyStateUpdate(this.state, result.decision.stateUpdate);
    this.state = recordTransmission(this.state, { origem: 'atco', texto: result.decision.spokenText, fontes: result.decision.sourceIds });
    return result;
  }
}
