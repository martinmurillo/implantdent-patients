// ─── Hoja del plan de pago para el paciente ──────────────────────────────────
// Genera el HTML de la hoja impresa. Función pura, sin DOM: así se puede
// renderizar desde Node con Chrome headless y comprobar de verdad que entra en
// una sola A4 apaisada y que se lee.
//
// Es lo que se le entrega al paciente en mano, así que va sin ningún control y
// con cuerpo de letra grande: se lee en la silla, no en una pantalla.

import { addMeses as addMesesISO } from "./planCalc.js";
import { fraseTramos, etiquetaMes } from "./fragmenta.js";
import { TITULO_LEGAL, parrafosLegales, CAMPOS_FIRMA, CLINICA } from "./legalPlan.js";

const eur0 = (n) => `${Math.round(n).toLocaleString("es-ES")} €`;
const eur2 = (n) => `${n.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
const fecha = (s) => { if (!s) return ""; const [y,m,d] = String(s).split("-"); return `${d}/${m}/${y}`; };
const esc = (t) => String(t ?? "").replace(/[<>&]/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c]));
// "2, 3, 5 y 6" — más corto que repetir "el mes N", que en la hoja cuesta líneas
const listaMeses = (ms) => ms.length < 2 ? String(ms[0] ?? "")
  : `${ms.slice(0, -1).join(", ")} y ${ms[ms.length - 1]}`;

export const estilosPlanImpreso = `
  @page{size:A4 landscape;margin:7mm;}
  *{box-sizing:border-box;}
  body{font-family:'DM Sans','Segoe UI',sans-serif;font-size:13pt;color:#12211f;margin:0;}
  .top{display:flex;align-items:center;gap:12px;border-bottom:3px solid #c9a84c;padding-bottom:1.5mm;margin-bottom:2mm;}
  .top img{width:60px;height:auto;}
  .top h1{font-size:21pt;margin:0;letter-spacing:.04em;text-transform:uppercase;line-height:1;}
  .top .who{font-size:12.5pt;color:#444;margin-top:1mm;}
  .board{display:grid;grid-template-columns:repeat(6,1fr);gap:2.5mm;}
  .col{border:1.5px solid #b8b8b8;border-radius:6px;display:flex;flex-direction:column;break-inside:avoid;}
  .ch{padding:1.5mm 2mm;border-bottom:1.5px solid #d8d8d8;}
  .ch .m{font-size:11.5pt;letter-spacing:.03em;text-transform:uppercase;color:#555;font-weight:700;}
  .ch .t{font-size:23pt;font-weight:800;line-height:1.02;}
  .ch .t.zero{color:#ccc;}
  .ch .v{font-size:11.5pt;color:#0e3b3e;font-weight:800;line-height:1.2;}
  .ch .k{font-size:12pt;color:#555;font-weight:600;}
  .bd{padding:1.8mm;display:flex;flex-direction:column;gap:1.2mm;flex:1;}
  .chip{background:#f2efe9;border-radius:5px;padding:1.2mm 1.8mm;line-height:1.15;}
  .chip b{display:block;font-weight:700;font-size:13pt;}
  .chip i{font-style:normal;color:#444;font-size:13pt;font-weight:700;}
  .st{margin-top:auto;padding:1.5mm 2mm;border-radius:5px;font-size:14pt;font-weight:800;
      display:flex;justify-content:space-between;gap:4px;
      -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .st span{white-space:nowrap;}
  .st.ok{background:#d9ede2;color:#155c3d;}
  .st.bad{background:#f9dcd6;color:#8c2d16;}
  .say{background:#fff;color:#111;border:2.5px solid #c9a84c;border-radius:8px;
       padding:2mm 3mm;margin-top:2mm;
       -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .say p{margin:0;font-size:17pt;line-height:1.15;font-weight:600;}
  /* solo los importes del titular van en grande: si esto alcanza a los "Mes N"
     del resumen, la hoja se va a dos páginas */
  .say p b{font-size:20pt;font-weight:800;}
  /* a dos columnas: el detalle por mes repite lo que ya muestra el tablero,
     así que no puede comerse media hoja */
  /* con la línea de tiempo abajo, el detalle por mes se omite: el tablero de
     arriba ya lo dice, y la hoja tiene que seguir siendo una */
  .say .sub{font-size:12.5pt;color:#222;margin-top:1.5mm;line-height:1.3;column-count:2;column-gap:8mm;}
  .say .sub b{font-weight:700;}
  .say .sub>div{break-inside:avoid;}
  .linea{margin-top:1.5mm;border:1.5px solid #b8b8b8;border-radius:6px;padding:1.5mm 2mm;break-inside:avoid;}
  .linea h2{font-size:11pt;margin:0 0 1.5mm;letter-spacing:.08em;text-transform:uppercase;color:#a07830;}
  .linea table{border-collapse:collapse;width:100%;}
  .linea td{text-align:center;padding:0.4mm 0.5mm;white-space:nowrap;font-size:10pt;}
  .linea td.et{text-align:left;font-size:8.5pt;color:#666;text-transform:uppercase;
               font-weight:700;padding-right:2mm;letter-spacing:.04em;}
  .linea tr.mes td{font-size:9pt;color:#666;font-weight:700;}
  .linea tr.tot td{font-size:12pt;font-weight:800;border-top:1.5px solid #d8d8d8;}
  .linea tr.tot td.on{background:#f7f3e6;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .linea .frase{font-size:12pt;font-weight:700;margin-top:1mm;line-height:1.22;}
  .linea .desglose{font-size:10.5pt;color:#555;margin-top:0.8mm;}
  .avisos{display:flex;gap:2.5mm;align-items:stretch;margin-top:1.2mm;break-inside:avoid;}
  .avisos>*{flex:1;}
  .warn,.info{font-size:10.5pt;padding:1.5mm 2mm;border-radius:5px;line-height:1.25;
              -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  /* El compromiso va en su propia hoja. Apretarlo en la primera obligaría a
     una letra minúscula, y una cláusula que no se lee es justo lo que la
     normativa de consumo considera no transparente. */
  .legal{break-before:page;padding-top:2mm;}
  .legal h3{font-size:17pt;margin:0 0 3mm;letter-spacing:.06em;text-transform:uppercase;
            color:#12211f;border-bottom:2.5px solid #c9a84c;padding-bottom:1.5mm;}
  .legal p{margin:0 0 2.5mm;font-size:11.5pt;line-height:1.45;text-align:justify;color:#1a1a1a;}
  .firma{display:flex;gap:6mm;margin-top:8mm;align-items:flex-end;}
  .firma>div{display:flex;flex-direction:column;}
  .firma .linea-f{border-bottom:1.5px solid #12211f;height:16mm;}
  .firma .lbl{font-size:10pt;color:#555;margin-top:1.5mm;text-transform:uppercase;
              letter-spacing:.04em;font-weight:600;}
  .pie{font-size:9.5pt;color:#777;margin-top:6mm;text-align:center;}
  /* Sin línea de tiempo sobran ~175px en la primera hoja: se reparten
     agrandando lo que el paciente tiene que leer. */
  body.holgado .ch .m,
  body.holgado .ch .v{font-size:12.5pt;}
  body.holgado .ch .t{font-size:27pt;}
  body.holgado .ch{padding:1.8mm 2.2mm;}
  body.holgado .chip{padding:1.6mm 2mm;line-height:1.2;}
  body.holgado .chip b,
  body.holgado .chip i{font-size:14.5pt;}
  body.holgado .st{font-size:15pt;padding:1.8mm 2.2mm;}
  body.holgado .bd{gap:1.6mm;padding:2mm;}
  body.holgado .say p{font-size:20pt;}
  body.holgado .say p b{font-size:24pt;}
  body.holgado .say .sub{font-size:13pt;line-height:1.35;}
  body.holgado .say{padding:2.5mm 3.5mm;}
  body.holgado .warn,
  body.holgado .info{font-size:12pt;}
  .warn{background:#f9dcd6;color:#8c2d16;border-left:4px solid #c2482f;}
  .info{background:#fbeed3;color:#6e4c0c;border-left:4px solid #c8891b;}
`;

export function htmlPlanImpreso({ plan, paciente, der, logoUrl = "" }) {
  const { txConMes, entrega, nCuotas, inicioQ, cuota, calc } = der;
  const meses = Array.from({ length: plan.nMeses }, (_, i) => i + 1);

  const columnas = meses.map(mes => {
    const items = txConMes.filter(t => t.mes === mes);
    const importe = calc.porMes[mes-1] || 0;
    let sub = "";
    if (plan.modo === "cuotas") {
      if (mes === 1 && entrega > 0) sub = "Entrega";
      else if (mes >= inicioQ && mes < inicioQ + nCuotas) sub = `Cuota ${mes-inicioQ+1} de ${nCuotas}`;
    }
    // En la hoja del paciente solo se avisa de lo que falta. El "Cubierto" es
    // información de gestión interna y no aporta nada a quien la recibe.
    const falta = items.length ? calc.ejecutadoAcum[mes-1] - calc.cobradoAcum[mes-1] : 0;
    // Fecha real de vencimiento: es lo que compromete al paciente a un día
    const vence = plan.fechaInicio ? fecha(addMesesISO(plan.fechaInicio, mes - 1)) : "";
    return `<div class="col">
      <div class="ch">
        <div class="m">${mes === 1 ? "Hoy · Mes 1" : `Mes ${mes}`}</div>
        <div class="t${importe < 0.5 ? " zero" : ""}">${importe < 0.5 ? "—" : eur0(importe)}</div>
        ${vence || sub ? `<div class="v">${vence}${vence && sub ? ` · <span class="k">${sub}</span>` : sub}</div>` : ""}
      </div>
      <div class="bd">
        ${items.map(t => `<div class="chip"><b>${esc(t.nombre)}${t.pieza ? ` · ${esc(t.pieza)}` : ""}</b><i>${eur0(t.importe)}</i></div>`).join("")}
        ${falta > 0.5 ? `<div class="st bad"><span>Faltan</span><span>${eur0(falta)}</span></div>` : ""}
      </div>
    </div>`;
  }).join("");

  const pasos = meses.map(mes => {
    const nombres = [...new Set(txConMes.filter(t => t.mes === mes).map(t => t.nombre))];
    return nombres.length ? `<div><b>Mes ${mes}</b> — ${esc(nombres.join(", "))}</div>` : "";
  }).join("");

  const titular = plan.modo === "cuotas"
    ? `Entrega de <b>${eur0(entrega)}</b> y ${nCuotas} cuotas de <b>${eur2(cuota)}</b>.`
    : `Empieza pagando <b>${eur0(calc.porMes[0] || 0)}</b> y después paga cada vez que viene.`;

  const avisos = [
    calc.descubiertos.length
      ? `<div class="warn">${calc.descubiertos.length > 1 ? "Meses" : "Mes"} ${listaMeses(calc.descubiertos.map(d => d.mes))}: se hace más tratamiento del que está pagado. Mayor descubierto: <b>${eur0(calc.peorDescubierto)}</b>.</div>`
      : "",
    plan.modo === "cuotas" && Math.abs(calc.diferencia) > 1
      ? `<div class="info">El plan ${calc.diferencia > 0 ? `cobra <b>${eur2(calc.diferencia)}</b> por encima` : `queda <b>${eur2(-calc.diferencia)}</b> por debajo`} del presupuesto (${eur2(calc.totalTratamiento)}).</div>`
      : "",
  ].join("");

  // Lo que realmente desembolsa el paciente cada mes cuando la entrega va
  // financiada: durante unos meses paga la cuota de Fragmenta y la de clínica.
  const { frag, linea, desembolsoTotal } = der;
  const fila = (clase, etiqueta, valores, marcar = false) =>
    `<tr class="${clase}"><td class="et">${etiqueta}</td>` +
    valores.map(v => {
      const num = typeof v === "number";
      const on = marcar && num && v > 0.005;
      return `<td class="${on ? "on" : ""}">${num ? (v < 0.005 ? "—" : eur0(v)) : v}</td>`;
    }).join("") + `</tr>`;

  const lineaHtml = !frag ? "" : `<div class="linea">
    <h2>Lo que paga cada mes</h2>
    <table><tbody>
      ${fila("mes", "", linea.map(f => etiquetaMes(plan.fechaInicio, f.mes)))}
      ${fila("", "Fragmenta", linea.map(f => f.fragmenta))}
      ${fila("", "Clínica",   linea.map(f => f.clinica))}
      ${fila("tot", "Total",  linea.map(f => f.total), true)}
    </tbody></table>
    <div class="frase">${fraseTramos(linea)}</div>
    <div class="desglose">Desembolso real total <b>${eur2(desembolsoTotal)}</b> — tratamiento ${eur2(der.calc.totalPlan)} + comisión Fragmenta ${eur2(frag.comision)}</div>
  </div>`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>Plan de pago — ${esc(paciente?.name || "")}</title>
<style>${estilosPlanImpreso}</style></head><body class="${frag ? "" : "holgado"}">
  <div class="top">
    ${logoUrl ? `<img src="${logoUrl}" alt=""/>` : ""}
    <div>
      <h1>Plan de pago</h1>
      <div class="who">${esc(paciente?.name || "")}${paciente?.budget_no ? ` · Presupuesto ${esc(paciente.budget_no)}` : ""}${plan.fechaInicio ? ` · Inicio ${fecha(plan.fechaInicio)}` : ""}</div>
    </div>
  </div>
  <div class="board">${columnas}</div>
  <div class="say">
    <p>${titular}</p>
    <div class="sub">${frag ? "" : pasos}<div style="opacity:.75;margin-top:1.5mm">Tratamiento ${eur2(calc.totalTratamiento)}${plan.modo === "cuotas" ? ` · Plan ${eur2(calc.totalPlan)}` : ""}</div></div>
  </div>
  ${lineaHtml}
  ${avisos ? `<div class="avisos">${avisos}</div>` : ""}
  <div class="legal">
    <h3>${TITULO_LEGAL}</h3>
    ${parrafosLegales({ conFragmenta: !!frag }).map(t => `<p>${t}</p>`).join("")}
    <div class="firma">
      ${CAMPOS_FIRMA.map(c => `<div style="flex:${c.ancho}">
        <div class="linea-f"></div><div class="lbl">${c.etiqueta}</div>
      </div>`).join("")}
    </div>
    <div class="pie">${CLINICA.nombre} · ${CLINICA.direccion}</div>
  </div>
</body></html>`;
}
