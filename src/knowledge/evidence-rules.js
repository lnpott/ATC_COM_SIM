/**
 * Regras de evidência documental por família de intenção (F1).
 *
 * Substitui o mapa `intent -> único artigo fixo` que existia em `src/controller.js`
 * (`SOURCE_BY_INTENT`) e em `src/retrieval.js` (`PROFILES`). A diferença essencial não é
 * estrutural, é de autoridade: cada `coverage` é uma **variante documentada** da mesma
 * família, com o artigo que a fundamenta citado explicitamente. Uma comunicação escolhe a
 * variante pelos termos que ela contém, e a decisão só cita fontes realmente recuperadas.
 *
 * Isso é o que torna possível o §7/§8 do PLANO_REF: uma emergência por **fogo** é
 * fundamentada no art. 66 (`MCA-100-16-artigo-0066-001`) e uma pane de **motor** no art. 64,
 * em vez de todas as emergências compartilharem um único artigo fixo.
 *
 * Fundamentação verificada no corpus (`atc-simulator-chunks.json`, 374 chunks):
 * - art. 39 — glossário bilíngue (`pt-en`): ROGER, CONFIRME/CONFIRM, REPORTE/REPORT,
 *   COTEJE/READ BACK, CORREÇÃO/CORRECTION;
 * - art. 43 — Tabela 15, palavras e frases padronizadas de urgência/emergência com
 *   correspondentes em inglês ("Fogo a bordo / Fire on board", "Fogo no porão / Fire in the
 *   hold", "Fogo no toalete / Fire in the lavatory", "Pane de motor / Engine failure");
 * - art. 64 — problemas no motor (bilíngue); art. 66 — fogo e fumaça a bordo;
 * - art. 71 — impossibilidade de cumprir instrução ATC;
 * - arts. 12 e 45 — obrigação de cotejar (somente `pt`; ver A3.14 no plano);
 * - arts. 125/126/129/114/132/122/59/164/165 — fraseologia por situação.
 *
 * Nada aqui pode ser alterado sem citação. Uma família sem variante documentada não
 * "inventa" resposta: devolve cobertura insuficiente com o motivo explícito.
 */

export const EVIDENCE_RULES = Object.freeze({
  emergency: {
    family: 'emergency',
    phase: 'emergencia',
    queries: {
      pt: ['mayday emergência falha motor fogo fumaça pane posição intenção'],
      en: ['mayday emergency engine failure fire smoke position intentions'],
    },
    // A ordem das variantes é a precedência documental: uma comunicação que declara fogo ou
    // fumaça é tratada como fogo a bordo (art. 66), mesmo contendo o termo "motor".
    coverage: [
      {
        id: 'fire_or_smoke',
        when: ['fogo', 'fumaça', 'fumaca', 'smoke', 'fire', 'incêndio', 'incendio', 'toalete', 'porão', 'porao', 'lavatory'],
        sources: ['MCA-100-16-artigo-0066-001', 'MCA-100-16-artigo-0043-001'],
        citation: 'MCA 100-16, Art. 66 (fogo e fumaça a bordo) e Art. 43 (Tabela 15)',
        realization: 'emergency_fire',
        requires: {
          field: 'parte da aeronave',
          // Vocabulário da própria Tabela 15 (art. 43): porão/hold, toalete/lavatory,
          // trem de pouso/wheel well, motor/engine, cabine/cabin, carga/cargo.
          detect: ['porão', 'porao', 'toalete', 'lavatory', 'trem de pouso', 'trem principal', 'gear', 'motor', 'engine', 'cabine', 'cabin', 'carga', 'cargo', 'asa', 'wing'],
          documented: ['porão', 'toalete', 'trem de pouso', 'motor', 'cabine', 'carga'],
          question: 'emergency_fire_location',
        },
      },
      {
        id: 'engine',
        when: ['motor', 'engine', 'pane'],
        sources: ['MCA-100-16-artigo-0064-001'],
        citation: 'MCA 100-16, Art. 64 (problemas no motor)',
        realization: 'emergency_engine',
      },
      {
        id: 'urgency',
        when: ['pan pan', 'pan-pan', 'urgência', 'urgencia', 'urgency'],
        sources: ['MCA-100-16-artigo-0043-001', 'MCA-100-16-artigo-0064-001'],
        citation: 'MCA 100-16, Art. 43 (Tabela 15) e Art. 64',
        realization: 'emergency_urgency',
      },
    ],
    defaultVariant: 'engine',
  },

  taxi_request: {
    family: 'ground_movement',
    phase: 'solo',
    queries: { pt: ['instruções táxi solicitação autorização ponto espera'], en: ['taxi instructions request clearance holding point'] },
    coverage: [{
      id: 'taxi_instruction',
      sources: ['MCA-100-16-artigo-0125-001'],
      citation: 'MCA 100-16, Art. 125 (instruções de táxi)',
      realization: 'taxi_clearance',
    }],
  },

  takeoff_request: {
    family: 'departure',
    phase: 'decolagem',
    queries: { pt: ['instruções decolagem pronto partida autorização'], en: ['takeoff departure ready clearance runway'] },
    coverage: [{
      id: 'takeoff_clearance',
      sources: ['MCA-100-16-artigo-0126-001'],
      citation: 'MCA 100-16, Art. 126 (autorização de decolagem)',
      realization: 'takeoff_clearance',
    }],
  },

  traffic_circuit: {
    family: 'aerodrome_traffic',
    phase: 'aproximacao',
    queries: { pt: ['entrada circuito tráfego autorização pista vento qnh'], en: ['join traffic pattern clearance runway wind altimeter'] },
    coverage: [{
      id: 'circuit_entry',
      sources: ['MCA-100-16-artigo-0129-001'],
      citation: 'MCA 100-16, Art. 129 (circuito de tráfego)',
      realization: 'circuit_clearance',
    }],
  },

  approach_request: {
    family: 'approach',
    phase: 'aproximacao',
    queries: { pt: ['autorização aproximação procedimento'], en: ['approach clearance procedure'] },
    coverage: [{
      id: 'approach_clearance',
      sources: ['MCA-100-16-artigo-0114-001'],
      citation: 'MCA 100-16, Art. 114 (procedimentos de aproximação)',
      realization: 'approach_clearance',
    }],
  },

  landing_request: {
    family: 'landing',
    phase: 'pouso',
    queries: { pt: ['autorização pouso pista final vento'], en: ['landing clearance runway final wind'] },
    coverage: [{
      id: 'landing_clearance',
      sources: ['MCA-100-16-artigo-0132-001'],
      citation: 'MCA 100-16, Art. 132 (reta final e pouso)',
      realization: 'landing_clearance',
    }],
  },

  frequency_change: {
    family: 'communications',
    phase: 'rota',
    queries: { pt: ['troca frequência aprovada comunicação'], en: ['frequency change approved communication'] },
    sessionContext: {
      reason: 'controller-frequency-not-configured',
      matches: (interpretation) => interpretation.frequencyRequestType === 'assignment_request',
      message: {
        pt: 'A frequência de transferência não está configurada para este cenário; mantenha esta frequência.',
        en: 'Transfer frequency is not configured for this scenario; remain on this frequency.',
      },
    },
    coverage: [{
      id: 'change_permission',
      when: ['troca', 'mudança', 'mudanca', 'mudanc', 'change'],
      sources: ['MCA-100-16-artigo-0059-001'],
      citation: 'MCA 100-16, Art. 59 (mudança de frequência)',
      realization: 'frequency_approval',
    }],
  },

  vfr_departure: {
    family: 'departure',
    phase: 'solo',
    queries: { pt: ['informações partida voo VFR pista qnh'], en: ['departure information VFR runway altimeter'] },
    coverage: [{
      id: 'vfr_departure_clearance',
      sources: ['MCA-100-16-artigo-0122-001'],
      citation: 'MCA 100-16, Art. 122 (informações de partida VFR)',
      realization: 'vfr_departure_clearance',
      requires: {
        field: 'destino ou setor',
        sessionField: 'destino',
        fromInterpretation: 'destination',
        question: 'vfr_destination',
      },
    }],
  },

  readback: {
    family: 'readback',
    phase: 'solo',
    queries: { pt: ['cotejamento autorização pista frequência'], en: ['readback clearance runway frequency'] },
    coverage: [{
      id: 'readback_obligation',
      sources: ['MCA-100-16-artigo-0012-001'],
      alternatives: ['MCA-100-16-artigo-0045-001'],
      citation: 'MCA 100-16, Art. 12, III (art. 39: COTEJE / READ BACK; art. 138: "your read back is correct")',
      realization: 'readback_correct',
      sessionRequires: {
        field: 'autorização cotejada',
        sessionField: 'ultima_autorizacao',
        reason: 'readback-without-clearance',
        message: {
          pt: 'Não há autorização pendente de cotejamento nesta sessão.',
          en: 'There is no clearance pending readback in this session.',
        },
      },
    }],
  },

  position_report: {
    family: 'position_reporting',
    phase: 'geral',
    queries: { pt: ['reporte posições posição serviço radar'], en: ['position report reporting radar service'] },
    coverage: [{
      id: 'report_received',
      sources: ['MCA-100-16-artigo-0039-001'],
      alternatives: ['MCA-100-16-artigo-0165-001', 'MCA-100-16-artigo-0164-001'],
      citation: 'MCA 100-16, Art. 39 (ROGER — "Recebi toda sua última transmissão"; REPORTE — "Passe-me a seguinte informação")',
      realization: 'acknowledge',
    }],
  },

  unable: {
    family: 'unable',
    phase: 'geral',
    queries: { pt: ['impossibilitado instrução ATC aviso de resolução'], en: ['unable ATC instruction resolution advisory'] },
    coverage: [{
      id: 'unable_acknowledged',
      sources: ['MCA-100-16-artigo-0071-001', 'MCA-100-16-artigo-0039-001'],
      citation: 'MCA 100-16, Art. 71 (impossibilidade de cumprir instrução ATC) e Art. 39 (ROGER)',
      realization: 'acknowledge',
    }],
  },

  weather_request: {
    family: 'weather',
    phase: 'geral',
    queries: { pt: ['solicitação meteorologia detalhada'], en: ['detailed weather request'] },
    external: true,
    coverage: [],
  },
})

/**
 * Intenções que o schema do intérprete já produz e para as quais o simulador ainda não tem
 * contrato de decisão documentado. Elas NÃO são reportadas como ausência de cobertura no
 * manual — apenas como limitação do simulador (ver A3.1 no plano).
 */
export const PENDING_FAMILIES = Object.freeze([
  'go_around', 'hold_position', 'runway_crossing_request', 'initial_contact',
  'clarification', 'repeat_request', 'taxi_readback', 'takeoff_readback', 'landing_readback',
  'frequency_readback', 'circuit_report',
])

export function evidenceRule(intent) {
  return EVIDENCE_RULES[intent] ?? null
}

const FOLD = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')

/** Variante documentada aplicável à comunicação, escolhida pelos termos que ela contém. */
export function selectVariant(rule, rawText) {
  if (!rule?.coverage?.length) return null
  const folded = FOLD(rawText)
  const matched = rule.coverage.find((variant) => variant.when?.some((term) => folded.includes(FOLD(term))))
  if (matched) return matched
  if (rule.defaultVariant) return rule.coverage.find(({ id }) => id === rule.defaultVariant) ?? null
  return rule.coverage.length === 1 ? rule.coverage[0] : null
}
