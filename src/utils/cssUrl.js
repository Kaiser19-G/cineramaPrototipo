// url("...") seguro para usar dentro de un estilo en línea: con comillas y con todo lo que podría
// salirse del url() codificado (comillas, paréntesis, espacios, saltos de línea, barra invertida).
export function cssUrl(u) {
  if (!u) return undefined;
  const safe = encodeURI(String(u)).replace(/[()'"\\]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `url("${safe}")`;
}
