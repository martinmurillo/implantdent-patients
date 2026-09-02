import type { Nodo, ItemComposicion, Bloque, DatosFusion, TipoFirmante } from './tipos';

// ------------------------------------------------------------
// Quién firma
// ------------------------------------------------------------
//
// No es "menor de edad = firman los padres". La Llei 21/2000 de
// Catalunya (art. 7) lo reparte así:
//
//   >= 16 años   el propio paciente firma. Los padres NO firman.
//   12 a 15      firma el representante, habiendo escuchado al menor.
//   < 12         firma el representante.
//
// Un paciente de 17 años de ortodoncia firma él. Si en el
// consentimiento firman solo los padres, está mal montado.
//
// Si la clínica decide otro criterio, se cambia AQUÍ y en ningún
// otro sitio. Que quede como constante, no repartido por el código.

export const EDAD_CONSENTIMIENTO_PROPIO = 16;
export const EDAD_ESCUCHAR_AL_MENOR = 12;

export function calcularEdad(fechaNacimientoISO: string, referencia = new Date()): number {
  const nac = new Date(fechaNacimientoISO);
  let edad = referencia.getFullYear() - nac.getFullYear();
  const m = referencia.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && referencia.getDate() < nac.getDate())) edad--;
  return edad;
}

export function determinarFirmante(edad: number): TipoFirmante {
  return edad >= EDAD_CONSENTIMIENTO_PROPIO ? 'paciente' : 'representante';
}

export function requiereEscucharAlMenor(edad: number): boolean {
  return edad >= EDAD_ESCUCHAR_AL_MENOR && edad < EDAD_CONSENTIMIENTO_PROPIO;
}

// ------------------------------------------------------------
// Sustitución de campos
// ------------------------------------------------------------
//
// Los marcadores son {{ruta.al.campo}}. Un campo sin valor NO se
// deja vacío: se sustituye por una línea de puntos para escribirlo
// a mano. Es preferible un hueco visible a un documento que parece
// completo y no lo está.

const RELLENO_MANUAL = '.'.repeat(28);

export function aplicarFusion(texto: string, datos: DatosFusion): string {
  return texto.replace(/\{\{([a-z_.]+)\}\}/g, (_, ruta: string) => {
    const valor = ruta
      .split('.')
      .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], datos);
    if (valor === undefined || valor === null || valor === '') return RELLENO_MANUAL;
    return String(valor);
  });
}

function fusionarNodo(nodo: Nodo, datos: DatosFusion, firmante: TipoFirmante): Nodo | null {
  switch (nodo.tipo) {
    case 'bloque_representante':
      // Se descarta entero cuando firma el propio paciente.
      if (firmante !== 'representante') return null;
      return {
        ...nodo,
        nodos: fusionarNodos(nodo.nodos, datos, firmante),
      };
    case 'titulo':
    case 'parrafo':
      return { ...nodo, texto: aplicarFusion(nodo.texto, datos) };
    case 'lista':
      return { ...nodo, items: nodo.items.map((i) => aplicarFusion(i, datos)) };
    case 'recuadro':
      return { ...nodo, nodos: fusionarNodos(nodo.nodos, datos, firmante) };
    default:
      return nodo;
  }
}

export function fusionarNodos(
  nodos: Nodo[],
  datos: DatosFusion,
  firmante: TipoFirmante,
): Nodo[] {
  return nodos
    .map((n) => fusionarNodo(n, datos, firmante))
    .filter((n): n is Nodo => n !== null);
}

// ------------------------------------------------------------
// Composición: resuelve referencias a bloques compartidos y
// devuelve el árbol plano y ya fusionado que se congela en la BD.
// ------------------------------------------------------------

export function componerDocumento(
  composicion: ItemComposicion[],
  bloques: Map<string, Bloque>,
  datos: DatosFusion,
  firmante: TipoFirmante,
): Nodo[] {
  const plano: Nodo[] = [];
  for (const item of composicion) {
    if ('ref' in item) {
      const bloque = bloques.get(item.ref);
      if (!bloque) throw new Error(`Falta el bloque compartido "${item.ref}"`);
      plano.push(...bloque.contenido);
    } else {
      plano.push(...item.nodos);
    }
  }
  return fusionarNodos(plano, datos, firmante);
}

// ------------------------------------------------------------
// Fecha en castellano, sin dependencias.
// ------------------------------------------------------------

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function fechaLarga(d = new Date()): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
