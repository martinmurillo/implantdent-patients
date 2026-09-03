// Qué consentimientos pide el presupuesto de un paciente.
//
// Las reglas van sobre el nombre del tratamiento tal y como viene del PDF, sin
// acentos y en minúsculas. El orden importa: gana la primera que casa, así que
// lo específico va antes que lo general —"corona sobre implante" tiene que
// caer en la implantosoportada y no en la dentosoportada—.
//
// Esto SUGIERE, no decide. El modal marca lo que sale de aquí pero enseña los
// dieciocho: si una regla no reconoce un tratamiento, el consentimiento que
// falta se ve igual y se marca a mano. Al revés —ocultar lo no detectado— un
// fallo de la tabla dejaría al paciente sin firmar algo, y eso no se nota.
//
// Contrastado contra los 522 nombres distintos que hay hoy en la base: 514
// reconocidos. Los 8 que quedan fuera no llevan consentimiento (limpiezas,
// urgencias, estudios y un complemento de ortodoncia).

const REGLAS = [
  // Lo específico primero
  [/sobre implante|implantosoportad|multi ?unit|pilar de cicatriz/, "PROTESISIMPLANTOSOPORTADA"],
  // "Protesis Completa acrilic inferior", "Protesis Parcial acrilica de 4 a 6
  // piezas", "Compostura ... malla metalica": todas removibles
  [/sobredentadura|ataches|barra colada|esqueletic|acrilic|compostura|protesis (removible|completa|parcial)/, "PROTESISREMOVIBLE"],
  [/elevacion (de )?seno|elevacion sinusal|seno maxilar/,  "ELEVACION"],
  [/regeneracion|membrana/,                                "REGENERACION"],
  [/injerto|gramos? de hueso|hueso liofiliz/,              "INJERTOS"],
  [/reendodoncia|retratamiento (de )?conducto/,            "REENDO"],

  [/implante/,                                             "IMPLANTES"],
  [/endodoncia|pulpectom|pulpotom|conducto/,               "ENDODONCIA"],
  [/carilla/,                                              "CARILLAS"],
  [/corona|perno|puente|ponti|muñon|provisional/,          "PROTESISDENTOSOPORTADA"],
  // "exo" a secas es la abreviatura que usan en los presupuestos
  [/exodoncia|extracc|odontosecc|cordal|cirugia|frenectom|quiste|\bexo\b/, "CIRUGIAORAL"],
  [/periodon|curetaje|colgajo|raspad|tartrectom/,          "PERIODONCIA"],
  [/ortodoncia|bracket|braquet|alineador|invisalign|invisaling|retenedor|contencion|placa expansiva/, "ORTODONCIA"],
  [/ferula|ferulizac|placa de descarga|bruxis/,            "FERULA"],
  [/blanqueam/,                                            "BLANQUEAMIENTO"],
  [/obturacion|empaste|reconstrucc|composite|amalgama|caries|sellado|proteccion pulpar|recubrimiento pulpar/, "CONSERVADORA"],
  [/odontopediatr|corona de acero/,                        "ODONTOPEDIATRIA"],
];

const plano = (t) => String(t || "").normalize("NFD")
  .replace(/[̀-ͯ]/g, "").toLowerCase();

// El consentimiento que corresponde a un tratamiento, o null si ninguno.
// Limpiezas, radiografías, estudios y revisiones no llevan consentimiento.
export function consentimientoDe(nombreTratamiento) {
  const t = plano(nombreTratamiento);
  if (!t) return null;
  for (const [re, codigo] of REGLAS) {
    if (re.test(t)) return codigo;
  }
  return null;
}

// Los códigos que pide una lista de tratamientos, sin repetir y en el orden en
// que aparecen en el presupuesto.
export function consentimientosDelPresupuesto(tratamientos = []) {
  const vistos = [];
  for (const t of tratamientos) {
    const c = consentimientoDe(t?.name ?? t?.nombre ?? t);
    if (c && !vistos.includes(c)) vistos.push(c);
  }
  return vistos;
}
