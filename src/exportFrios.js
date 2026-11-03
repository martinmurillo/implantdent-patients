// Excel de pacientes fríos (con implantes o con ortodoncia), con formato: un
// bloque por paciente que baja varias filas. Primero y en negrita el grupo
// destacado con su suma; debajo el resto con su suma aparte.
// Se usa ExcelJS porque SheetJS (xlsx) no escribe negritas ni colores. Se
// carga solo al exportar, para no pesar en el arranque.

// Cada exportación destaca un grupo de tratamientos: primero y en negrita,
// con su suma; el resto va debajo con su suma aparte.
const ORTO_RX = /ortodoncia|orthodontic|invisalign|invisaling|invisible\s|ortod|placa expansiva|hass/i;
export const GRUPOS = {
  implantes: {
    hoja: "Fríos con implantes",
    titulo: "Pacientes fríos con implantes",
    seccion: "IMPLANTES · MULTIUNIT · CORONAS SOBRE IMPLANTE",
    suma: "Suma implantes",
    // Implantes, multiunit y lo que va sobre implante (coronas, aditamentos...).
    entra: (nombre = "") => /implant|multi\s*-?\s*unit/i.test(nombre),
    // Dentro del grupo: implantes, luego multiunit, luego coronas y el resto.
    orden: (nombre = "") =>
      /implant/i.test(nombre) && !/corona|aditamento|pilar/i.test(nombre) ? 0
      : /multi\s*-?\s*unit/i.test(nombre) ? 1 : 2,
    // Qué paciente sale: el que tiene un implante, no solo la corona.
    paciente: items => items.some(t => /implant/i.test(t.name || "") && !/corona|aditamento/i.test(t.name || "")),
  },
  ortodoncia: {
    hoja: "Fríos con ortodoncia",
    titulo: "Pacientes fríos con ortodoncia",
    seccion: "ORTODONCIA",
    suma: "Suma ortodoncia",
    entra: (nombre = "") => ORTO_RX.test(nombre),
    orden: () => 0,
    paciente: items => items.some(t => ORTO_RX.test(t.name || "")),
  },
};

export function separarTratamientos(items, grupo = GRUPOS.implantes) {
  const limpios = items.filter(t => (t.name || "").trim());
  const destacados = limpios.filter(t => grupo.entra(t.name))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => grupo.orden(a.t.name) - grupo.orden(b.t.name) || a.i - b.i)
    .map(x => x.t);
  const otros = limpios.filter(t => !grupo.entra(t.name));
  const suma = arr => arr.reduce((a, t) => a + (parseFloat(t.value) || 0), 0);
  return { destacados, otros, sumaDestacados: suma(destacados), sumaOtros: suma(otros) };
}

const EUR = '#,##0.00 "€"';
const COLOR = {
  cabecera: "FF2C3250", cabeceraTexto: "FFFFFFFF",
  implantes: "FFDCEBFA", implantesTexto: "FF1F4E79",
  otros: "FFEFEFEF", otrosTexto: "FF555555",
  total: "FFFFF4D6", borde: "FFB8C2D6",
};
const relleno = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/**
 * pacientes: [{ hc, nombre, telefono, fecha, presupuesto, items:[{name,value}],
 *               descuentoPct, descuentoImporte, total, pagado, comentarios:[string] }]
 * tipo: "implantes" | "ortodoncia"; corte: "dd/mm/aaaa" para la cabecera;
 * archivo: nombre del .xlsx
 */
export async function exportarFrios({ tipo = "implantes", pacientes, corte, archivo }) {
  const grupo = GRUPOS[tipo];
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(grupo.hoja, {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [{ width: 46 }, { width: 15 }, { width: 3 }, { width: 80 }];

  const datos = pacientes.map(p => ({ ...p, ...separarTratamientos(p.items, grupo) }));
  const totalDestacados = datos.reduce((a, p) => a + p.sumaDestacados, 0);

  const t1 = ws.addRow([`${grupo.titulo} — fecha de corte: ${corte}`]);
  t1.font = { bold: true, size: 15, color: { argb: COLOR.cabecera } };
  const t2 = ws.addRow([`${datos.length} paciente(s) · ${grupo.suma.toLowerCase()} de todos:`, totalDestacados]);
  t2.font = { italic: true, color: { argb: "FF666666" } };
  t2.getCell(2).numFmt = EUR;
  t2.getCell(2).font = { bold: true, color: { argb: COLOR.implantesTexto } };
  ws.addRow([]);

  for (const p of datos) {
    // Cabecera del paciente: HC, nombre y teléfono bien visibles.
    const cab = ws.addRow([`HC ${p.hc || "—"}  ·  ${p.nombre || "Sin nombre"}`, "", "", `☎ ${p.telefono || "sin teléfono"}`]);
    ws.mergeCells(cab.number, 1, cab.number, 3);
    cab.height = 22;
    cab.eachCell({ includeEmpty: true }, c => {
      c.fill = relleno(COLOR.cabecera);
      c.font = { bold: true, size: 12, color: { argb: COLOR.cabeceraTexto } };
      c.alignment = { vertical: "middle" };
    });
    const sub = ws.addRow([`Presupuesto nº ${p.presupuesto || "—"} · ${p.fecha || "sin fecha"}`, "", "", "Comentarios"]);
    sub.getCell(1).font = { italic: true, color: { argb: "FF666666" } };
    sub.getCell(4).font = { bold: true, color: { argb: COLOR.cabecera } };

    // Columna de la izquierda: tratamientos. Derecha: comentarios en paralelo.
    const lineas = [];
    lineas.push({ tipo: "seccion", texto: grupo.seccion, fondo: COLOR.implantes, color: COLOR.implantesTexto });
    p.destacados.forEach(t => lineas.push({ tipo: "imp", texto: t.name.trim(), valor: parseFloat(t.value) || 0 }));
    lineas.push({ tipo: "suma", texto: grupo.suma, valor: p.sumaDestacados, fondo: COLOR.implantes, color: COLOR.implantesTexto });
    if (p.otros.length) {
      lineas.push({ tipo: "hueco" });
      lineas.push({ tipo: "seccion", texto: "OTROS TRATAMIENTOS", fondo: COLOR.otros, color: COLOR.otrosTexto });
      p.otros.forEach(t => lineas.push({ tipo: "otro", texto: t.name.trim(), valor: parseFloat(t.value) || 0 }));
      lineas.push({ tipo: "suma", texto: "Suma otros tratamientos", valor: p.sumaOtros, fondo: COLOR.otros, color: COLOR.otrosTexto });
    }
    lineas.push({ tipo: "hueco" });
    if (p.descuentoImporte) lineas.push({ tipo: "otro", texto: `Descuento ${p.descuentoPct}%`, valor: -p.descuentoImporte });
    lineas.push({ tipo: "total", texto: "TOTAL PRESUPUESTO", valor: p.total });
    // Aviso de pagos: un frío que ya pagó algo no es igual que uno que nunca pagó.
    lineas.push(p.pagado > 0
      ? { tipo: "pago", texto: "⚠ YA TIENE PAGOS — pagado", valor: p.pagado }
      : { tipo: "sinpago", texto: "Sin pagos aún" });

    const comentarios = p.comentarios.length ? p.comentarios : ["Sin comentarios"];
    const n = Math.max(lineas.length, comentarios.length);
    for (let i = 0; i < n; i++) {
      const l = lineas[i] || { tipo: "hueco" };
      const fila = ws.addRow([l.texto ?? "", l.valor ?? null, "", comentarios[i] ?? ""]);
      const [cA, cB] = [fila.getCell(1), fila.getCell(2)];
      cB.numFmt = EUR;
      if (l.tipo === "seccion") {
        [cA, cB].forEach(c => { c.fill = relleno(l.fondo); c.font = { bold: true, size: 9, color: { argb: l.color } }; });
      } else if (l.tipo === "imp") {
        [cA, cB].forEach(c => { c.font = { bold: true, color: { argb: COLOR.implantesTexto } }; });
      } else if (l.tipo === "suma") {
        [cA, cB].forEach(c => {
          c.fill = relleno(l.fondo);
          c.font = { bold: true, color: { argb: l.color } };
          c.border = { top: { style: "thin", color: { argb: COLOR.borde } } };
        });
        cA.alignment = { horizontal: "right" };
      } else if (l.tipo === "pago") {
        [cA, cB].forEach(c => {
          c.fill = relleno("FFD4EFDF");
          c.font = { bold: true, size: 12, color: { argb: "FF1E8449" } };
          c.border = { bottom: { style: "thin", color: { argb: "FF1E8449" } } };
        });
        cA.alignment = { horizontal: "right" };
      } else if (l.tipo === "sinpago") {
        cA.font = { italic: true, color: { argb: "FF999999" } };
        cA.alignment = { horizontal: "right" };
      } else if (l.tipo === "total") {
        [cA, cB].forEach(c => {
          c.fill = relleno(COLOR.total);
          c.font = { bold: true, size: 12 };
          c.border = { top: { style: "medium" }, bottom: { style: "medium" } };
        });
        cA.alignment = { horizontal: "right" };
      }
      const cD = fila.getCell(4);
      cD.alignment = { wrapText: true, vertical: "top" };
      cD.font = { color: { argb: p.comentarios.length ? "FF333333" : "FFAAAAAA" }, italic: !p.comentarios.length };
    }
    // Separación entre pacientes.
    ws.addRow([]);
    ws.addRow([]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = archivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
