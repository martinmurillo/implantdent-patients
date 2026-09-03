// Corrección de los destrozos del OCR en las plantillas de consentimiento.
//
// Cada corrección se declara: la plantilla, el trozo a buscar y con qué se
// sustituye. Nada de regex genéricas sobre el texto legal: se toca lo que está
// escrito aquí y nada más, y si un trozo no aparece el script avisa en vez de
// seguir en silencio.
//
// Tres clases de destrozo, y por qué la corrección es segura:
//
//  A. El cuerpo repite, hecho papilla, una frase que ya está limpia en un
//     bloque compartido que esa misma plantilla referencia. Se borra el
//     duplicado: el texto bueno sigue saliendo, del bloque.
//  B. Una etiqueta seguida de ruido donde el original tiene una línea de
//     puntos para rellenar a mano. Se deja la etiqueta y se pone un
//     campo_manual, que es lo que hace el escaneo.
//  C. Palabras pegadas o letras cambiadas, cotejadas contra el escaneo.
//
//   node scripts/corregir-ocr.mjs volcado.json > correcciones.sql
import { readFileSync } from "node:fs";

// "Asimismo el Sr/Sra ... por sus especiales condiciones ... riesgos añadidos
// consistentes en:" vive en el bloque riesgos_personalizados. Todas estas
// plantillas lo referencian, así que la copia del cuerpo sobra.
const ASIMISMO = /["“]?\s*(Asimismo|Auinismo|Asímismo)\s+el\s+(St\/STa|SISIN|niño\/a|Sr\/Sra)[\s\S]*?(consistentes en:|$)\s*/i;

const CORRECCIONES = {
  CIRUGIAORAL: [
    { que: "duplicado destrozado de riesgos_personalizados", buscar: ASIMISMO, poner: "" },
  ],
  CONSERVADORA: [
    { que: "comilla suelta", buscar: 'comportar este " tratamiento:', poner: "comportar este tratamiento:" },
  ],
  ODONTOPEDIATRIA: [
    { que: "duplicado destrozado de riesgos_personalizados", buscar: ASIMISMO, poner: "" },
    { que: "ruido tras 'alternativos como'", buscar: /alternativos\s+COMO\s+…+[\s\S]{0,40}?(?=\s*(El\/la|D\b))/i,
      poner: "alternativos como: " },
  ],
  ORTODONCIA: [
    // El párrafo abría repitiendo, destrozados, el preámbulo y la
    // identificación, que ya vienen de sus bloques. Se corta hasta donde
    // empieza el texto propio de ortodoncia.
    { que: "duplicado destrozado de preambulo+identificacion",
      buscar: /^En cumplimiento de la Ley 41\/2002[\s\S]*?previamente he aceptado\.\s*/i, poner: "" },
    { que: "ruido tras 'alternativos como'", buscar: /alternativos\s+COMO\s+…+[\s\S]{0,30}$/i,
      poner: "alternativos como:" },
  ],
  PROTESISDENTOSOPORTADA: [
    // Cotejado con originales/PROTESISDENTOSOPORTADA_1_p1.jpg
    { que: "Patología destructiva: ruido", buscar: /Patolog[íi]a destructiva dentaria de\s+…+[\s\S]*$/i,
      poner: "Patología destructiva dentaria de:" },
    { que: "Edemtulismo -> Edentulismo", buscar: /Edemtulismo en:\s*…+[\s\S]*$/i,
      poner: "Edentulismo en:" },
    { que: "Coronas: ruido", buscar: /^\|?\s*Coronas\s*=?[\s\S]*$/i, poner: "Coronas en:" },
    { que: "Canillaneos -> Carillas en", buscar: /^Canillaneos[\s\S]*$/i, poner: "Carillas en:" },
    { que: "alternativas terapeuticas: ruido", buscar: /alt[ée]rnativas terap[ée]uticas:?\s*[Ss]on:\s*…+[\s\S]*?(?=El.{0,2}la paciente)/i,
      poner: "alternativas terapéuticas son: " },
    { que: "ElVla -> El/la", buscar: /El.{0,2}la paciente/g, poner: "El/la paciente" },
    { que: "duplicado destrozado de riesgos_personalizados", buscar: ASIMISMO, poner: "" },
    // Cola destrozada del bloque declaracion, que la plantilla ya referencia
    { que: "duplicado destrozado de declaracion",
      buscar: /\s*Y,\s*DID[ÍI]A[\s\S]*$/i, poner: "" },
  ],
  PROTESISIMPLANTOSOPORTADA: [
    { que: "duplicado destrozado de riesgos_personalizados", buscar: ASIMISMO, poner: "" },
  ],
  PROTESISREMOVIBLE: [
    { que: "ruido tras 'alternativos como'", buscar: /Al[Ee]MAtIVOS\s+COMO[\s\S]*?(?=El.{0,2}la paciente)/i,
      poner: "alternativos como: " },
    { que: "ElVla -> El/la", buscar: /El\W?Vla paciente/g, poner: "El/la paciente" },
  ],
  REENDO: [
    // Membrete y pie de la Asociación Española de Endodoncia. El documento lo
    // entrega Implantdent: la dirección y el teléfono de otra entidad no
    // pueden aparecer en él.
    { que: "pie de AEDE", buscar: /C\/\s*Cochabamba,\s*24\s*Bajo B\s*Madrid\s*28016\s*España\s*T\.\s*629\s*605\s*613\s*aedeQaede\.info\s*\d\/\d/g, poner: "" },
    { que: "membrete de AEDE", buscar: /^A\s*E\s*D\s*E\s*Asociaci[óo]n Espa[ñn]ola de$/i, poner: "" },
    { que: "membrete de AEDE", buscar: /^—\s*=\s*endodoncia$/i, poner: "" },
    { que: "membrete de AEDE", buscar: /^Asociaci[óo]n Espa[ñn]ola de$/i, poner: "" },
    { que: "membrete de AEDE", buscar: /^Aee endodoncia$/i, poner: "" },
    { que: "membrete de AEDE", buscar: /Asociaci[óo]n Espa[ñn]ola de AEDE ENDODoncIA www\.aede\.info/gi, poner: "" },
    // Palabras pegadas, cotejadas con originales/REENDO_1_p*.jpg
    { que: "palabras pegadas", buscar: /fun-\s*=\s*ci[óo]nadecuada/i, poner: "función adecuada" },
    { que: "palabras pegadas", buscar: /¿C[óo]mosehace\?\s*=\s*Trasanestesiar/i, poner: "¿Cómo se hace? Tras anestesiar" },
    { que: "palabras pegadas", buscar: /materiales,de relleno\.utilizados enJa\.endodoncia/i, poner: "materiales de relleno utilizados en la endodoncia" },
    { que: "palabras pegadas", buscar: /comoelretratamiento/gi, poner: "como el retratamiento" },
    { que: "palabras pegadas", buscar: /noseconsiguiesen/gi, poner: "no se consiguiesen" },
    { que: "duplicado destrozado de identificacion", buscar: /N ae CO faloe-tel-T a Mo\)[\s\S]*?voluntariamente, DECLARO:\s*/i, poner: "" },
    { que: "Que el Dr/Dra destrozado",
      buscar: /OQueeUlalbr\/Dra[\s\S]*?me ha explicado/i, poner: "Que el Dr./Dra. me ha explicado" },
    { que: "linea de firma de AEDE",
      buscar: /^Edo:\s*D\/DA[\s\S]*$/i, poner: "" },
    // El escaneo lleva texto girado en el margen y el OCR lo dejó caer dentro
    // de las frases como simbolos sueltos. Un "=" o una "£" entre dos palabras
    // no es nada en castellano.
    { que: "simbolos sueltos del margen", buscar: /\s+[=£<>~]+\.?(?=\s)/g, poner: " " },
    { que: "ruido tras el/los diente/s",
      buscar: /en el\/los diente\/s\s+…+[^Y]*?(?=Y ME han)/i, poner: "en el/los diente/s: " },
  ],
};

const { pl } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const esc = (s) => s.replace(/'/g, "''");
const salida = ["-- Generado por scripts/corregir-ocr.mjs. No editar a mano.", "begin;", ""];
let aplicadas = 0, fallidas = [];

for (const p of pl) {
  const reglas = CORRECCIONES[p.codigo];
  if (!reglas) continue;
  let texto = JSON.stringify(p.composicion);

  const arbol = JSON.parse(texto);
  const recorrer = (nodos, fn) => nodos.forEach(n => {
    if (n.texto) n.texto = fn(n.texto);
    if (n.items) n.items = n.items.map(fn);
    if (n.etiqueta) n.etiqueta = fn(n.etiqueta);
    if (n.nodos) recorrer(n.nodos, fn);
  });

  for (const r of reglas) {
    let tocada = false;
    for (const item of arbol) {
      if (!item.nodos) continue;
      recorrer(item.nodos, (t) => {
        const nuevo = t.replace(r.buscar, r.poner);
        if (nuevo !== t) tocada = true;
        return nuevo.replace(/\s{2,}/g, " ").trim();
      });
    }
    if (tocada) { aplicadas++; console.error(`  ok    ${p.codigo}: ${r.que}`); }
    else { fallidas.push(`${p.codigo}: ${r.que}`); console.error(`  FALLA ${p.codigo}: ${r.que}`); }
  }

  // Se quedan fuera los nodos que hayan quedado vacíos
  for (const item of arbol) {
    if (!item.nodos) continue;
    item.nodos = item.nodos.filter(n =>
      !(n.tipo === "parrafo" && !String(n.texto || "").trim()) &&
      !(n.tipo === "titulo" && !String(n.texto || "").trim()) &&
      !(n.tipo === "lista" && !(n.items || []).some(i => i.trim())));
    if (item.nodos.some(n => n.items)) {
      item.nodos.forEach(n => { if (n.items) n.items = n.items.filter(i => i.trim()); });
    }
  }

  salida.push(`update consent_plantillas set composicion = '${esc(JSON.stringify(arbol))}'::jsonb`);
  salida.push(` where codigo = '${p.codigo}' and version = ${p.version};`);
  salida.push("");
}

salida.push("commit;");
console.error(`\n${aplicadas} correcciones aplicadas, ${fallidas.length} sin encontrar`);
if (fallidas.length) console.error("sin encontrar:\n  " + fallidas.join("\n  "));
process.stdout.write(salida.join("\n") + "\n");
