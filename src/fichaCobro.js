// ─── Ficha de cobro para recepción ───────────────────────────────────────────
// Una A4 entera por paciente, para tenerla en el mostrador. El paciente viene
// a pagar, recepción busca su ficha, apunta cuánto pagó y cómo, y ve de un
// vistazo si con ese pago le toca dar cita para algo.
//
// Arriba, una cabecera ancha con el logo y los datos del paciente. Debajo, la
// rejilla de cuotas a todo lo ancho, y la cita que dispara cada cuota va en su
// propia fila: recepción cobra un renglón y ahí mismo lee qué tiene que citar.
//
// Empezó cabiendo media hoja, pero en el mostrador se leía mal: prima que se
// lea y se pueda escribir encima antes que ahorrar papel.
import { nombreCortoTratamiento } from "./planCalc.js";

const eur = (n) => Number(n || 0).toLocaleString("es-ES",
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (s) => { if (!s) return ""; const [y, m, d] = String(s).split("-"); return `${d}/${m}/${y}`; };
const esc = (t) => String(t ?? "").replace(/[<>&]/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c]));

export const estilosFicha = `
  @page{size:A4 portrait;margin:0;}
  *{box-sizing:border-box;}
  body{margin:0;font-family:'DM Sans','Segoe UI',sans-serif;color:#12211f;width:210mm;}
  /* una A4 entera por ficha */
  .ficha{width:210mm;height:297mm;padding:13mm 12mm;break-inside:avoid;
         display:flex;flex-direction:column;overflow:hidden;}

  .cab{display:flex;align-items:center;gap:6mm;
       border-bottom:3px solid #c9a84c;padding-bottom:3mm;}
  .logo{height:17mm;width:auto;flex:none;}
  .quien{flex:1;min-width:0;}
  .nombre{font-size:24pt;font-weight:800;line-height:1.02;text-transform:uppercase;}
  .hc{font-size:13pt;color:#555;margin-top:1.2mm;}
  .plan{font-size:12pt;font-weight:700;color:#a07830;margin-top:1.4mm;
        letter-spacing:.03em;text-transform:uppercase;}
  .hoy{text-align:right;white-space:nowrap;flex:none;}
  .hoy .lbl{font-size:10.5pt;letter-spacing:.1em;color:#888;display:block;}
  .hoy .imp{font-size:30pt;font-weight:800;color:#0e3b3e;line-height:1;}

  /* Cuadrícula cerrada: recepción escribe a boli dentro de cada casilla, así
     que las celdas tienen que estar delimitadas por los cuatro lados.
     Anchos fijos: si no, la última columna se come todo el espacio sobrante
     y las casillas de escribir quedan desiguales. */
  table{width:100%;border-collapse:collapse;border:1.2px solid #555;
        table-layout:fixed;margin-top:5mm;height:var(--tabla);}
  th{font-size:10.5pt;text-transform:uppercase;letter-spacing:.04em;color:#555;
     text-align:left;border:1px solid #555;background:#f0eee9;
     padding:1.2mm 2mm;font-weight:700;}
  /* el alto de fila y el cuerpo los fija cada ficha según cuántas cuotas
     tenga: un plan de 24 meses no puede usar la misma letra que uno de 6 */
  td{font-size:var(--cuerpo);padding:0.5mm 2mm;border:1px solid #888;
     height:var(--alto);vertical-align:middle;}
  /* nowrap: una fecha o un importe partidos en dos líneas descuadran la fila */
  .f{width:16%;font-weight:600;white-space:nowrap;}
  .c{width:14%;text-align:right;font-weight:700;white-space:nowrap;}
  /* la casilla en blanco es la que recepción rellena a boli */
  .w{width:20%;background:#fff;}
  .forma{width:12%;font-size:var(--cuerpo-menor);color:#aaa;
         text-align:center;white-space:nowrap;}
  /* la cita va en la línea de la cuota que la dispara */
  .cita{width:38%;font-size:var(--cuerpo-cita);color:#0e3b3e;
        font-style:italic;line-height:1.15;}
  tr.pagada td{color:#999;background:#f7f7f5;}
  tr.pagada .c{text-decoration:line-through;}
  tr.pagada .cita{color:#5b7a72;}
  .ok{font-size:var(--cuerpo-menor);font-weight:800;color:#1c523b;letter-spacing:.06em;}

  .pie{font-size:10pt;color:#777;border-top:1px solid #ccc;
       padding-top:1.4mm;margin-top:auto;line-height:1.35;}
`;

// plan: fila de payment_plans · cuotas: sus payment_plan_cuotas · pagos: los del paciente
export function htmlFichaCobro({ plan, paciente, cuotas = [], estado, aPagarAhora = 0, logoUrl = "" }) {
  const porMes = new Map();
  for (const t of (plan.colocacion || [])) {
    const m = Number(t.mes) || 1;
    if (!porMes.has(m)) porMes.set(m, []);
    const corto = nombreCortoTratamiento(t.nombre);
    if (!porMes.get(m).includes(corto)) porMes.get(m).push(corto);
  }

  const orden = [...cuotas].sort((a, b) =>
    String(a.vence_el).localeCompare(String(b.vence_el)) || a.numero - b.numero);

  const filas = orden.map(c => {
    const est = estado?.meses.find(m => m.mes === c.mes);
    const pagada = est?.estado === "pagado";
    const citar = porMes.get(c.mes) || [];
    return `
      <tr class="${pagada ? "pagada" : ""}">
        <td class="f">${fecha(c.vence_el)}</td>
        <td class="c">${eur(c.importe)}</td>
        <td class="w">${pagada ? '<span class="ok">COBRADO</span>' : ""}</td>
        <td class="forma">${pagada ? "" : "V · E · T"}</td>
        <td class="cita">${esc(citar.join(", "))}</td>
      </tr>`;
  }).join("");

  const resumenPlan = plan.modo === "cuotas"
    ? `${plan.n_cuotas} cuotas de ${eur(plan.importe_cuota)} €`
    : "Paga según se va haciendo";

  // Alto disponible para la tabla, descontando márgenes, cabecera y pie.
  const ALTO_TABLA_MM = 200;
  const alto = Math.max(3.4, Math.min(18, ALTO_TABLA_MM / Math.max(1, orden.length)));
  // a 6,5 mm de fila le sientan 13pt; de ahí sale la proporción, con tope
  // arriba para que en planes cortos no salgan números desproporcionados
  const cuerpo = Math.max(8, Math.min(13, alto * 2));
  // La tabla estira hasta llenar el hueco, pero sin pasar de 18 mm por fila:
  // un plan de 5 cuotas no necesita renglones de tres centímetros.
  const tabla = `${(alto * orden.length + 10).toFixed(1)}mm`;

  const medidas = `--tabla:${tabla};`
    + `--alto:${alto.toFixed(2)}mm;`
    + `--cuerpo:${cuerpo.toFixed(1)}pt;`
    + `--cuerpo-menor:${(cuerpo * 0.85).toFixed(1)}pt;`
    + `--cuerpo-cita:${(cuerpo * 0.82).toFixed(1)}pt;`;

  return `
  <div class="ficha" style="${medidas}">
    <div class="cab">
      ${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt=""/>` : ""}
      <div class="quien">
        <div class="nombre">${esc(paciente?.name || plan.patient_name || "")}</div>
        <div class="hc">HC ${esc(paciente?.hc || "—")} · Presupuesto ${esc(plan.budget_no || "—")}</div>
        <div class="plan">Plan de pago · ${resumenPlan}</div>
      </div>
      <div class="hoy">
        <span class="lbl">A PAGAR AHORA</span>
        <span class="imp">${eur(aPagarAhora)} €</span>
      </div>
    </div>
    <table>
      <thead><tr>
        <th class="f">Vence</th><th class="c">Cuota</th>
        <th class="w">Pagado</th><th class="forma">Forma</th>
        <th class="cita">Con este pago, dar cita para</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="pie">
      V = Visa · E = Efectivo · T = Transferencia. &nbsp;|&nbsp;
      Si paga de menos, anotar la diferencia y sumarla a la <b>cuota siguiente</b>.
    </div>
  </div>`;
}

// El cálculo de arriba es una estimación: el alto real depende de cuánto texto
// lleven las citas y de si se parten. Antes de imprimir, cada ficha se mide de
// verdad y se encoge hasta caber. Así no hay plan, por largo que sea, que se
// salga de la hoja.
const AJUSTE = `
<script>
addEventListener("load", function () {
  document.querySelectorAll(".ficha").forEach(function (f) {
    var css = getComputedStyle(f);
    var alto = parseFloat(css.getPropertyValue("--alto"));
    var cuerpo = parseFloat(css.getPropertyValue("--cuerpo"));
    // 8pt es el suelo: por debajo no se puede escribir encima a boli
    var MINIMO = 8;
    function desborda() {
      return f.scrollHeight > f.clientHeight
        || [].some.call(f.children, function (h) { return h.scrollHeight > h.clientHeight; });
    }
    function aplicar() {
      f.style.setProperty("--tabla", (alto * f.querySelectorAll("tbody tr").length + 10).toFixed(2) + "mm");
      f.style.setProperty("--alto", alto.toFixed(2) + "mm");
      f.style.setProperty("--cuerpo", cuerpo.toFixed(2) + "pt");
      f.style.setProperty("--cuerpo-menor", (cuerpo * 0.85).toFixed(2) + "pt");
      f.style.setProperty("--cuerpo-cita", (cuerpo * 0.82).toFixed(2) + "pt");
    }
    var vueltas = 0;
    while (desborda() && vueltas++ < 80 && cuerpo > MINIMO) {
      alto *= 0.97; cuerpo *= 0.97; aplicar();
    }
  });
});
` + "<" + "/script>";

// Una ficha por hoja
export function htmlHojaFichas(fichas) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>Fichas de cobro</title><style>${estilosFicha}</style></head>
<body>${fichas.join("")}${AJUSTE}</body></html>`;
}
