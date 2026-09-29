// xlsx pesa ~437 KB minificado y solo hace falta cuando alguien sube un Excel,
// que es un puñado de veces al día. Importarlo estático metía ese peso en el
// arranque de todos. Se carga la primera vez que se usa y queda cacheado.
let pendiente = null;

export function cargarXLSX() {
  if (!pendiente) pendiente = import("xlsx");
  return pendiente;
}
