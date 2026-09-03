// Que cada consentimiento ocupe un número PAR de caras.
//
// En dúplex, tres páginas gastan las mismas dos hojas que cuatro pero dejan un
// reverso en blanco, y como cada consentimiento se firma por separado no se
// puede aprovechar esa cara para el siguiente. Dos caras, o cuatro, nunca tres.
//
// No hay forma de saber cuántas hojas ocupa un documento sin maquetarlo, así
// que se maqueta y se cuenta. Si sale impar se aprieta un poco la letra y se
// vuelve a contar, hasta un mínimo por debajo del cual el documento deja de
// leerse cómodo — y un consentimiento que no se lee no vale de nada.
//
// Si ni apretando se llega a par, se devuelve la escala original: encoger sin
// ganar una hoja es empeorar el documento a cambio de nada.

// Los objetos /Type /Page del PDF van en texto plano aunque los contenidos
// vayan comprimidos, así que se pueden contar sobre los bytes.
export function contarPaginasPdf(bytes) {
  const txt = new TextDecoder("latin1").decode(bytes);
  return (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

export const ESCALAS = [1, 0.94, 0.88, 0.82, 0.78];

// `medir` recibe una escala y devuelve el número de páginas a esa escala.
// Se pasa como función para poder probarlo sin maquetar PDFs de verdad.
export async function elegirEscala(medir, escalas = ESCALAS) {
  let primera = null;
  for (const e of escalas) {
    const paginas = await medir(e);
    if (primera === null) primera = { escala: e, paginas };
    if (paginas > 0 && paginas % 2 === 0) return { escala: e, paginas, ajustado: e !== escalas[0] };
  }
  // Ninguna escala da par: se queda como estaba.
  return { ...primera, ajustado: false };
}
