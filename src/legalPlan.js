// ─── Cláusula de compromiso de pago ──────────────────────────────────────────
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │  TEXTO LEGAL — editar aquí. Redactado sobre normativa española y      │
//   │  catalana vigente, pero NO es asesoramiento jurídico: conviene que    │
//   │  lo revise el asesor legal de la clínica antes de usarlo con          │
//   │  pacientes.                                                           │
//   └──────────────────────────────────────────────────────────────────────┘
//
// Base normativa de cada párrafo:
//
//  · Ley 16/2011, de contratos de crédito al consumo, art. 4.1.f y 4.1.j:
//    el aplazamiento SIN intereses, comisiones ni gastos queda excluido del
//    régimen de crédito al consumo. Por eso se hace constar expresamente.
//    ⚠ Si la clínica llegara a cobrar algo por aplazar, dejaría de estar
//    excluido y pasaría a exigir TAE, derecho de desistimiento y evaluación
//    de solvencia. La comisión de Frakmenta no cuenta: la cobra la
//    financiera, no la clínica, y por eso se deslinda en su propio párrafo.
//
//  · Ley 22/2010, Codi de consum de Catalunya, art. 251-3.2: en la
//    prestación de servicios hay obligación de presupuesto previo por
//    escrito salvo renuncia expresa del consumidor.
//
//  · Ley 41/2002, de autonomía del paciente: el consentimiento informado
//    del tratamiento es un acto distinto y no queda cubierto por esto.
//
//  · RDL 1/2007 (LGDCU): no se incluyen intereses de demora ni penalidades,
//    que en un contrato con consumidor son terreno de cláusula abusiva.
//
//  · Decret 121/2013: hojas oficiales de queja y reclamación.

// Fuente única de la dirección. Estaba escrita por separado aquí y en el aviso
// LOPD de los presupuestos, y así fue como una de las dos se quedó desfasada.
export const CLINICA = {
  nombre: "CLÍNICA IMPLANTDENT, S.L.",
  via:    "Carrer de Santa Eugènia, 2",
  cp:     "17001",
  ciudad: "Girona",
};

// Para el pie del compromiso, en línea suelta
export const DIRECCION_PIE   = `${CLINICA.via} · ${CLINICA.cp} ${CLINICA.ciudad}`;
// Para citarla dentro de una frase, como en el aviso de protección de datos
export const DIRECCION_TEXTO = `${CLINICA.via}, ${CLINICA.cp} ${CLINICA.ciudad}`;

export const TITULO_LEGAL = "Compromiso de pago";

// ─── Etiquetas de la línea de tiempo ─────────────────────────────────────────
// Van en una columna estrecha, así que se parten en dos líneas en vez de
// ensanchar la tabla.
export const ETIQUETAS_LINEA = {
  frakmenta: "Pago domiciliado con Frakmenta",
  clinica:   "Pago en clínica · 0% interés",
  total:     "Pago total por mes",
};

// ─── Datos de cobro ──────────────────────────────────────────────────────────
export const PAGO = {
  iban: "ES13 0049 2439 1723 1521 9830",
  // el concepto lleva el nombre completo del paciente para poder identificarlo
  concepto: (nombrePaciente) =>
    `${String(nombrePaciente || "").trim().toUpperCase()} · SANTA EUGENIA`.replace(/^· /, ""),
};

export const TITULO_PAGO = "Cómo y cuándo se abona";

// conFrakmenta añade el párrafo que deslinda a la financiera
export function parrafosLegales({ conFrakmenta = false } = {}) {
  return [
    `Quien firma declara haber recibido copia de este plan de pago, haber comprendido su contenido y aceptar el calendario de importes y fechas de vencimiento que en él se detalla, que reconoce como deuda cierta y exigible en cada uno de los vencimientos indicados.`,

    `${CLINICA.nombre} concede este aplazamiento sin intereses, comisiones ni gastos de ningún tipo, por lo que queda excluido del ámbito de aplicación de la Ley 16/2011, de 24 de junio, de contratos de crédito al consumo (art. 4).`,

    ...(conFrakmenta ? [
      `La financiación de la entrega inicial se formaliza en contrato aparte con FRAKMENTA, entidad ajena a esta clínica. La comisión que figura en este documento la percibe dicha entidad, no la clínica, y se rige por las condiciones de ese contrato.`,
    ] : []),

    `Este documento sirve como presupuesto previo por escrito a los efectos del art. 251-3.2 de la Ley 22/2010, del Código de consumo de Cataluña, y no sustituye al consentimiento informado del tratamiento, que se otorga por separado conforme a la Ley 41/2002.`,

    `Los tratamientos se realizarán conforme al cronograma de meses que figura en este plan. No pueden adelantarse a fechas anteriores a las previstas, salvo que se adelante también el pago en clínica correspondiente a esas fases.`,

    `El impago de dos vencimientos consecutivos faculta a la clínica a interrumpir el calendario y a reclamar el importe pendiente correspondiente al tratamiento ya realizado. Cualquier modificación de este plan requiere acuerdo por escrito de ambas partes.`,

    `Esta clínica dispone de hojas oficiales de queja, reclamación y denuncia a disposición de los pacientes.`,
  ];
}

export const CAMPOS_FIRMA = [
  { etiqueta: "Nombre y apellidos", ancho: 3 },
  { etiqueta: "DNI / NIE",          ancho: 2 },
  { etiqueta: "Fecha",              ancho: 1.4 },
  { etiqueta: "Firma",              ancho: 2.6 },
];
