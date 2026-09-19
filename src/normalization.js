const PHONETIC = new Map([
  ['alfa', 'A'], ['alpha', 'A'], ['bravo', 'B'], ['charlie', 'C'], ['delta', 'D'],
  ['echo', 'E'], ['foxtrot', 'F'], ['golf', 'G'], ['hotel', 'H'], ['india', 'I'],
  ['juliett', 'J'], ['kilo', 'K'], ['lima', 'L'], ['mike', 'M'], ['november', 'N'],
  ['oscar', 'O'], ['papa', 'P'], ['quebec', 'Q'], ['romeo', 'R'], ['sierra', 'S'],
  ['tango', 'T'], ['uniform', 'U'], ['victor', 'V'], ['whiskey', 'W'], ['x-ray', 'X'],
  ['xray', 'X'], ['yankee', 'Y'], ['zulu', 'Z'],
]);

const DIGITS = new Map([
  ['zero', '0'], ['one', '1'], ['um', '1'], ['uma', '1'], ['two', '2'], ['dois', '2'],
  ['tree', '3'], ['three', '3'], ['três', '3'], ['tres', '3'], ['four', '4'], ['quatro', '4'],
  ['fife', '5'], ['five', '5'], ['cinco', '5'], ['six', '6'], ['seis', '6'], ['seven', '7'],
  ['sete', '7'], ['eight', '8'], ['oito', '8'], ['niner', '9'], ['nine', '9'], ['nove', '9'],
]);

const STT_FIXES = new Map([
  ['de colagem', 'decolagem'], ['qui une agá', 'QNH'], ['q n h', 'QNH'],
]);

export function normalizePhraseology(input) {
  if (typeof input !== 'string') throw new TypeError('texto deve ser uma string.');
  let text = input.trim().replace(/\s+/g, ' ');
  for (const [heard, replacement] of STT_FIXES) {
    text = text.replace(new RegExp(`\\b${heard}\\b`, 'giu'), replacement);
  }
  const words = text.split(' ');
  for (let i = 0; i < words.length; i += 1) {
    const clean = words[i].toLocaleLowerCase('pt-BR').replace(/[.,;:]$/u, '');
    if (PHONETIC.has(clean)) words[i] = PHONETIC.get(clean);
  }
  text = words.join(' ').replace(/(?:\b[A-Z]\b(?:[ -]+|$)){2,}/g, (sequence) => (
    `${sequence.replace(/[^A-Z]/g, '')} `
  )).trim().replace(/\s+/g, ' ');
  return text.replace(/\b(?:zero|one|um|uma|two|dois|tree|three|três|tres|four|quatro|fife|five|cinco|six|seis|seven|sete|eight|oito|niner|nine|nove)(?:[ -]+(?:zero|one|um|uma|two|dois|tree|three|três|tres|four|quatro|fife|five|cinco|six|seis|seven|sete|eight|oito|niner|nine|nove))+\b/giu,
    (sequence) => sequence.split(/[ -]+/).map((word) => DIGITS.get(word.toLocaleLowerCase('pt-BR'))).join(''));
}

export function expandForSpeech(input, idioma = 'pt') {
  if (typeof input !== 'string') throw new TypeError('texto deve ser uma string.');
  const digits = idioma === 'en'
    ? ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner']
    : ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  return input
    .replace(/\bRWY\s*(\d+)\b/gi, (_, value) => `${idioma === 'en' ? 'runway' : 'pista'} ${[...value].map((n) => digits[n]).join(' ')}`)
    .replace(/\bQNH\s*(\d+)\b/gi, (_, value) => `QNH ${[...value].map((n) => digits[n]).join(' ')}`)
    .replace(/\bFL\s*(\d+)\b/gi, (_, value) => `${idioma === 'en' ? 'flight level' : 'nível de voo'} ${[...value].map((n) => digits[n]).join(' ')}`);
}
