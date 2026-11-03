// Excel de pacientes fríos con implantes, con formato: un bloque por paciente
// que baja varias filas. Primero y en negrita los implantes, multiunit y
// coronas sobre implante con su suma; debajo el resto con su suma aparte.
// Se usa ExcelJS porque SheetJS (xlsx) no escribe negritas ni colores. Se
// carga solo al exportar, para no pesar en el arranque.

// Implantes, multiunit y lo que va sobre implante (coronas, aditamentos...).
export const esDeImplante = (nombre = "") => /implant|multi\s*-?\s*unit/i.test(nombre);

// Dentro del grupo: implantes, luego multiunit, luego coronas y el resto.
const ordenImplante = (nombre = "") =>
  /implant/i.test(nombre) && !/corona|aditamento|pilar/i.test(nombre) ? 0
  : /multi\s*-?\s*unit/i.test(nombre) ? 1 : 2;

export function separarTratamientos(items) {
  const limpios = items.filter(t => (t.name || "").trim());
  const implantes = limpios.filter(t => esDeImplante(t.name))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => ordenImplante(a.t.name) - ordenImplante(b.t.name) || a.i - b.i)
    .map(x => x.t);
  const otros = limpios.filter(t => !esDeImplante(t.name));
  const suma = arr => arr.reduce((a, t) => a + (parseFloat(t.value) || 0), 0);
  return { implantes, otros, sumaImplantes: suma(implantes), sumaOtros: suma(otros) };
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
 * corte: "dd/mm/aaaa" para la cabecera; archivo: nombre del .xlsx
 */
export async function exportarFriosImplantes({ pacientes, corte, archivo }) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Fríos con implantes", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [{ width: 46 }, { width: 15 }, { width: 3 }, { width: 80 }];

  const datos = pacientes.map(p => ({ ...p, ...separarTratamientos(p.items) }));
  const totalImplantes = datos.reduce((a, p) => a + p.sumaImplantes, 0);

  const t1 = ws.addRow([`Pacientes fríos con implantes — fecha de corte: ${corte}`]);
  t1.font = { bold: true, size: 15, color: { argb: COLOR.cabecera } };
  const t2 = ws.addRow([`${datos.length} paciente(s) · suma de implantes de todos:`, totalImplantes]);
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
    lineas.push({ tipo: "seccion", texto: "IMPLANTES · MULTIUNIT · CORONAS SOBRE IMPLANTE", fondo: COLOR.implantes, color: COLOR.implantesTexto });
    p.implantes.forEach(t => lineas.push({ tipo: "imp", texto: t.name.trim(), valor: parseFloat(t.value) || 0 }));
    lineas.push({ tipo: "suma", texto: "Suma implantes", valor: p.sumaImplantes, fondo: COLOR.implantes, color: COLOR.implantesTexto });
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
