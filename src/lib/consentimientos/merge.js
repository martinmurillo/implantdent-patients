// Fusión de datos, edad del paciente, quién firma y composición del documento.
//
// ── El modelo de bloques ────────────────────────────────────────────────────
// Un consentimiento es un array de NODOS. El renderizador mapea cada tipo a un
// componente de react-pdf. No hay HTML libre: eso mantiene la maquetación bajo
// control y permite editar el contenido desde la app sin poder romper el PDF.
//
//   { tipo: 'titulo',        texto, nivel? }          nivel 1 = título del documento
//   { tipo: 'parrafo',       texto }
//   { tipo: 'lista',         items: [] }
//   { tipo: 'recuadro',      nodos: [] }              no se parte entre páginas
//   { tipo: 'campo_manual',  etiqueta?, lineas? }     líneas para rellenar a boli
//   { tipo: 'bloque_representante', nodos: [] }       solo si firma un representante
//   { tipo: 'firmas',        columnas: [{etiqueta}] } no se parte entre páginas
//   { tipo: 'salto_pagina' }
//
// Una entrada de COMPOSICIÓN es { ref: 'codigo' } —referencia a un bloque
// compartido— o { nodos: [] } —contenido propio de esa plantilla—.
//
// DATOS DE FUSIÓN, la forma que espera aplicarFusion():
//   paciente:    nombre, documento, fecha_nacimiento, edad, domicilio,
//                telefono, historia_clinica
//   profesional: nombre, colegiado
//   clinica:     razon_social, cif, registro_sanitario, direccion, email_dpd
//   tratamiento: piezas
//   lugar, fecha
//
// El firmante es 'paciente' o 'representante'.
//
// (Esto venía de tipos.ts, que en JavaScript no dejaba nada: eran solo
// declaraciones de tipo. Vive aquí para no dejar un archivo vacío.)

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

export function calcularEdad(fechaNacimientoISO, referencia = new Date()) {
  const nac = new Date(fechaNacimientoISO);
  let edad = referencia.getFullYear() - nac.getFullYear();
  const m = referencia.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && referencia.getDate() < nac.getDate())) edad--;
  return edad;
}

export function determinarFirmante(edad) {
  return edad >= EDAD_CONSENTIMIENTO_PROPIO ? 'paciente' : 'representante';
}

export function requiereEscucharAlMenor(edad) {
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

// Un dato que falta se enseña como línea de puntos, no como hueco. Se exporta
// porque el pie del PDF no pasa por la fusión —está escrito en el componente—
// y tiene que seguir la misma regla: si el CIF no está, se escribe a mano.
export function oPuntos(valor, largo = 28) {
  return valor === undefined || valor === null || String(valor).trim() === ''
    ? '.'.repeat(largo)
    : String(valor);
}

export function aplicarFusion(texto, datos) {
  return texto.replace(/\{\{([a-z_.]+)\}\}/g, (_, ruta) => {
    const valor = ruta.split('.').reduce((acc, k) => acc?.[k], datos);
    if (valor === undefined || valor === null || valor === '') return RELLENO_MANUAL;
    return String(valor);
  });
}

function fusionarNodo(nodo, datos, firmante) {
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
    // Las etiquetas también llevan marcadores. Endodoncia tiene un
    // campo_manual con "Plan de tratamiento (piezas {{tratamiento.piezas}})",
    // y cayendo por el default salía impreso tal cual en el consentimiento
    // del paciente.
    case 'campo_manual':
      return nodo.etiqueta
        ? { ...nodo, etiqueta: aplicarFusion(nodo.etiqueta, datos) }
        : nodo;
    case 'firmas':
      return {
        ...nodo,
        columnas: nodo.columnas.map((c) => ({ ...c, etiqueta: aplicarFusion(c.etiqueta, datos) })),
      };
    default:
      return nodo;
  }
}

export function fusionarNodos(nodos, datos, firmante) {
  return nodos
    .map((n) => fusionarNodo(n, datos, firmante))
    .filter((n) => n !== null);
}

// ------------------------------------------------------------
// Composición: resuelve referencias a bloques compartidos y
// devuelve el árbol plano y ya fusionado que se congela en la BD.
// ------------------------------------------------------------

export function componerDocumento(composicion, bloques, datos, firmante) {
  const plano = [];
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

export function fechaLarga(d = new Date()) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
