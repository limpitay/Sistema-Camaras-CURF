// Quita marcas diacriticas (tildes, dieresis, la virgulilla de la n) filtrando
// por rango de codigo en vez de un literal/escape unicode en el regex, que es
// fragil de editar a mano sin corromper el archivo.
export function quitarAcentos(texto) {
  return Array.from((texto || '').normalize('NFD'))
    .filter((ch) => { const codigo = ch.codePointAt(0); return codigo < 0x0300 || codigo > 0x036f; })
    .join('');
}
