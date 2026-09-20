const PHONETIC = new Map(Object.entries({ alfa: 'A', alpha: 'A', bravo: 'B', charlie: 'C', delta: 'D', echo: 'E', foxtrot: 'F', golf: 'G', hotel: 'H', india: 'I', juliett: 'J', juliet: 'J', kilo: 'K', lima: 'L', mike: 'M', november: 'N', oscar: 'O', papa: 'P', quebec: 'Q', romeo: 'R', sierra: 'S', tango: 'T', uniform: 'U', victor: 'V', whiskey: 'W', xray: 'X', yankee: 'Y', zulu: 'Z' }))

export function normalizeCallsign(text) {
  const direct = /\b(?:PT-?[A-Z]{3}|PP-?[A-Z]{3}|PR-?[A-Z]{3}|PS-?[A-Z]{3})\b/i.exec(text)
  if (direct) return { raw: direct[0], normalized: direct[0].replace('-', '').toUpperCase(), spoken: direct[0], confidence: 0.99, source: 'explicit' }
  const words = text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]+/g) ?? []
  for (let start = 0; start < words.length; start += 1) {
    const letters = []; let end = start
    while (end < words.length && PHONETIC.has(words[end]) && letters.length < 8) { letters.push(PHONETIC.get(words[end])); end += 1 }
    if (letters.length >= 5 && letters[0] === 'P' && ['T', 'P', 'R', 'S'].includes(letters[1])) {
      return { raw: words.slice(start, end).join(' '), normalized: letters.join(''), spoken: words.slice(start, end).join(' '), confidence: 0.98, source: 'explicit' }
    }
  }
  return null
}
