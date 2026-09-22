import { interpretTransmission } from '../src/transmission.js'

const probes = [
  'Solo Galeão, PT-ABC reportando posição dez milhas ao sul',
  'PT-ABC reporte de posição, dez milhas ao sul',
  'PT-ABC informo posição cinco milhas na final',
  'PT-ABC impossibilitado de cumprir a instrução',
  'PT-ABC impossibilitado por aviso de resolução TCAS',
  'PT-ABC arremetendo',
  'PT-ABC iniciando arremetida',
  'PT-ABC arremetida, solicitando nova aproximação',
  'PT-ABC vai arremeter',
]
for (const text of probes) {
  const result = interpretTransmission(text, { idioma: 'pt', state: {} })
  console.log(`${result.intent.padEnd(18)} | ${text}`)
}
