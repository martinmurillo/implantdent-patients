// Que cada consentimiento ocupe un número PAR de caras, con la letra lo más
// grande que quepa.
//
// En dúplex, un documento con un número impar de páginas deja un reverso en
// blanco —y como cada consentimiento se firma por separado, esa cara no la
// puede aprovechar el siguiente—. Dos caras, o cuatro, nunca tres. Y una sola
// tampoco: la primera página del siguiente acabaría impresa en su reverso.
//
// No hay forma de saber cuántas hojas ocupa un documento sin maquetarlo, así
// que se maqueta y se cuenta. Fijado el número de caras, se busca la escala
// más grande que sigue cabiendo: si un consentimiento entra en dos caras con
// letra de 9,5pt y sobra media página, la letra puede subir hasta llenarla.
//
// Es una búsqueda binaria y cuesta unos cuantos maquetados, así que NO se hace
// al generar: la escala se calcula una vez por plantilla con
// scripts/ajustar-escalas.jsx y se guarda en consent_plantillas.escala. El
// contenido de una plantilla solo cambia cuando alguien la edita.

// Los objetos /Type /Page del PDF van en texto plano aunque los contenidos
// vayan comprimidos, así que se pueden contar sobre los bytes.
export function contarPaginasPdf(bytes) {
  const txt = new TextDecoder("latin1").decode(bytes);
  return (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

// A cuántas caras hay que aspirar, visto lo que ocupa a tamaño normal.
export function carasObjetivo(paginasANormal) {
  const p = paginasANormal;
  if (p <= 0) return 0;
  if (p % 2 === 0) return p;      // ya es par: se mantiene y se agranda la letra
  if (p === 1) return 2;          // una sola cara deja el reverso al siguiente
  return p - 1;                   // impar: se aprieta hasta la par de abajo
}

// Por debajo de 0,88 la letra baja de 8,4pt y el documento deja de leerse
// cómodo. Antes que eso, se prefiere la letra normal y una cara en blanco.
export const LIMITES = { min: 0.70, max: 1.60, iteraciones: 7, minLegible: 0.88 };

// `medir` recibe una escala y devuelve las páginas que ocupa a esa escala.
// Se pasa como función para poder probar la búsqueda sin maquetar PDFs.
export async function mejorEscala(medir, limites = LIMITES) {
  const { min, max, iteraciones, minLegible } = { ...LIMITES, ...limites };
  const normal = await medir(1);
  const objetivo = carasObjetivo(normal);
  if (!objetivo) return { escala: 1, paginas: normal, objetivo, alcanzado: false };

  // Cuando apretar no sale a cuenta —porque ni al mínimo cabe, o porque para
  // caber habría que dejar la letra ilegible— se deja el cuerpo como está y,
  // si el total es impar, se añade una cara en blanco. En dúplex gasta la
  // misma hoja que apretarlo, y sin ella la primera página del siguiente
  // consentimiento acabaría impresa en el reverso de este.
  const sinApretar = () => ({
    escala: 1,
    paginas: normal,
    objetivo: normal % 2 === 0 ? normal : normal + 1,
    relleno: normal % 2 !== 0,
    alcanzado: true,
  });

  if (await medir(min) > objetivo) return sinApretar();

  // Las páginas crecen con la escala, así que se puede buscar por bisección la
  // mayor escala que sigue cabiendo en el objetivo.
  let bajo = min, alto = max, mejor = { escala: min, paginas: await medir(min) };
  for (let i = 0; i < iteraciones; i++) {
    const medio = (bajo + alto) / 2;
    const paginas = await medir(medio);
    if (paginas <= objetivo) { mejor = { escala: medio, paginas }; bajo = medio; }
    else alto = medio;
  }
  const escala = Math.round(mejor.escala * 1000) / 1000;

  if (escala < minLegible) return sinApretar();

  return {
    escala, paginas: mejor.paginas, objetivo,
    relleno: false,
    alcanzado: mejor.paginas === objetivo,
  };
}
