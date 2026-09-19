export const GOLDEN_RULE = 'A IA não pode inventar fraseologia, autorização ou procedimento. Toda resposta precisa estar ancorada em trecho recuperado dos manuais. Se não houver base documental para responder, a IA declara que não há cobertura para aquilo — nunca improvisa.';

export function buildGroundedRequest({ texto, idioma, estado, resultados }) {
  if (!Array.isArray(resultados)) throw new TypeError('resultados deve ser uma lista.');
  const evidence = resultados.filter(({ score }) => score > 0);
  if (evidence.length === 0) {
    return { coberto: false, resposta: idioma === 'en' ? 'No documentary coverage.' : 'Não há cobertura documental.', contexto: [] };
  }
  return {
    coberto: true,
    system: `${GOLDEN_RULE}\nResponda em ${idioma === 'en' ? 'inglês' : 'português'} e devolva texto_falado, ids_fontes e atualizacao_estado em JSON.`,
    user: JSON.stringify({ transmissao: texto, estado }),
    contexto: evidence.map(({ id, documento, artigo, texto: trecho }) => ({ id, documento, artigo, trecho })),
  };
}

export function validateGroundedReply(reply, request) {
  if (!request.coberto) throw new Error('resposta não permitida sem cobertura documental.');
  if (!reply?.texto_falado || !Array.isArray(reply.ids_fontes) || reply.ids_fontes.length === 0) {
    throw new TypeError('resposta estruturada inválida.');
  }
  const allowed = new Set(request.contexto.map(({ id }) => id));
  if (reply.ids_fontes.some((id) => !allowed.has(id))) throw new Error('resposta cita fonte não recuperada.');
  return reply;
}
