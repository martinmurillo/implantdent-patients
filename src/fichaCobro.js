// ─── Ficha de cobro para recepción ───────────────────────────────────────────
// Media A4 para recortar y tener en el mostrador. El paciente viene a
// pagar, recepción busca su ficha, apunta cuánto pagó y cómo, y ve de un
// vistazo si con ese pago le toca dar cita para algo.
//
// Se imprimen dos por hoja, con la línea de corte por el medio.
import { nombreCortoTratamiento } from "./planCalc.js";

const eur = (n) => Number(n || 0).toLocaleString("es-ES",
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (s) => { if (!s) return ""; const [y, m, d] = String(s).split("-"); return `${d}/${m}/${y}`; };
const esc = (t) => String(t ?? "").replace(/[<>&]/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c]));

export const estilosFicha = `
  @page{size:A4 portrait;margin:0;}
  *{box-sizing:border-box;}
  body{margin:0;font-family:'DM Sans','Segoe UI',sans-serif;color:#12211f;width:210mm;}
  /* media A4: dos por hoja, con la línea de corte por el medio. Un plan muy
     largo se lleva la hoja entera antes que quedarse en letra ilegible. */
  .ficha{width:210mm;height:148.5mm;padding:7mm 9mm;
         border-bottom:1px dashed #bbb;break-inside:avoid;
         display:flex;flex-direction:column;overflow:hidden;}
  .ficha.entera{height:297mm;}
  .cab{display:flex;justify-content:space-between;align-items:flex-start;
       border-bottom:2.5px solid #c9a84c;padding-bottom:1.4mm;}
  .nombre{font-size:15pt;font-weight:800;line-height:1.05;text-transform:uppercase;}
  .hc{font-size:10pt;color:#555;margin-top:0.6mm;}
  .hoy{text-align:right;white-space:nowrap;padding-left:5mm;}
  .hoy .lbl{font-size:8pt;letter-spacing:.1em;color:#888;}
  .hoy .imp{font-size:19pt;font-weight:800;color:#0e3b3e;line-height:1;}
  .plan{font-size:10pt;font-weight:700;color:#a07830;margin:1.2mm 0 0.8mm;
        letter-spacing:.04em;text-transform:uppercase;}
  table{width:100%;border-collapse:collapse;}
  th{font-size:8pt;text-transform:uppercase;letter-spacing:.05em;color:#777;
     text-align:left;border-bottom:1.5px solid #999;padding-bottom:1mm;font-weight:700;}
  /* el alto de fila y el cuerpo los fija cada ficha según cuántas cuotas
     tenga: un plan de 24 meses no puede usar la misma letra que uno de 6 */
  td{font-size:var(--cuerpo);padding:0.4mm 0;border-bottom:1px solid #ccc;
     height:var(--alto);vertical-align:top;}
  .f{width:26mm;font-weight:600;}
  .c{width:22mm;text-align:right;padding-right:5mm;font-weight:700;}
  .w{width:38mm;}
  .forma{width:28mm;font-size:var(--cuerpo-menor);color:#999;letter-spacing:.1em;}
  tr.pagada td{color:#999;}
  tr.pagada .c{text-decoration:line-through;}
  .ok{font-size:var(--cuerpo-menor);font-weight:800;color:#1c523b;letter-spacing:.06em;}
  /* qué citar con ese pago, debajo de su fila */
  .cita td{border-bottom:1px solid #ccc;padding:0 0 0.4mm;height:auto;
           font-size:var(--cuerpo-cita);color:#0e3b3e;font-style:italic;line-height:1.1;}
  .cita b{font-style:normal;font-weight:700;}
  .pie{font-size:7.5pt;color:#777;border-top:1px solid #ccc;
       padding-top:1mm;margin-top:auto;line-height:1.35;}
`;

// plan: fila de payment_plans · cuotas: sus payment_plan_cuotas · pagos: los del paciente
export function htmlFichaCobro({ plan, paciente, cuotas = [], estado, aPagarAhora = 0 }) {
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
        <td class="w"></td>
      </tr>` + (citar.length ? `
      <tr class="cita">
        <td colspan="5">Con este pago, <b>dar cita para ${esc(citar.join(", "))}</b></td>
      </tr>` : "");
  }).join("");

  const resumenPlan = plan.modo === "cuotas"
    ? `${plan.n_cuotas} cuotas de ${eur(plan.importe_cuota)} €`
    : "Paga según se va haciendo";

  // Alto disponible para la tabla dentro de la media hoja, descontando
  // cabecera, título y pie. Se reparte entre las cuotas y las líneas de cita,
  // que ocupan algo más de media fila cada una.
  const ALTO_TABLA_MM = 103;
  const nCitas = orden.filter(c => (porMes.get(c.mes) || []).length).length;
  const unidades = orden.length + nCitas * 0.62;
  const alto = Math.max(2.5, Math.min(5.2, ALTO_TABLA_MM / Math.max(1, unidades)));
  // a 5,2 mm de fila le sientan 11pt; de ahí sale la proporción
  const cuerpo = Math.max(5.5, Math.min(11, alto * 2.12));

  const medidas = `--alto:${alto.toFixed(2)}mm;`
    + `--cuerpo:${cuerpo.toFixed(1)}pt;`
    + `--cuerpo-menor:${(cuerpo * 0.85).toFixed(1)}pt;`
    + `--cuerpo-cita:${(cuerpo * 0.78).toFixed(1)}pt;`;

  return `
  <div class="ficha" style="${medidas}">
    <div class="cab">
      <div>
        <div class="nombre">${esc(paciente?.name || plan.patient_name || "")}</div>
        <div class="hc">HC ${esc(paciente?.hc || "—")} · Presupuesto ${esc(plan.budget_no || "—")}</div>
      </div>
      <div class="hoy">
        <div class="lbl">A PAGAR</div>
        <div class="imp">${eur(aPagarAhora)} €</div>
      </div>
    </div>
    <div class="plan">Plan de pago · ${resumenPlan}</div>
    <table>
      <thead><tr>
        <th class="f">Vence</th><th class="c">Cuota</th><th class="w">Pagado</th>
        <th class="forma">Forma</th><th class="w">Deuda anterior</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="pie">
      V = Visa · E = Efectivo · T = Transferencia &nbsp;|&nbsp;
      Si paga de menos, anotar la diferencia en la <b>línea siguiente</b> y sumarla a esa cuota.
    </div>
  </div>`;
}

// El cálculo de arriba es una estimación: el alto real de las líneas de cita
// depende de cuánto texto lleven y de si se parten. Antes de imprimir, cada
// ficha se mide de verdad y se encoge hasta caber. Así no hay plan, por largo
// que sea, que se salga de la media hoja.
const AJUSTE = `
<script>
addEventListener("load", function () {
  document.querySelectorAll(".ficha").forEach(function (f) {
    var css = getComputedStyle(f);
    var alto = parseFloat(css.getPropertyValue("--alto"));
    var cuerpo = parseFloat(css.getPropertyValue("--cuerpo"));
    // 7pt es el suelo: por debajo no se puede escribir encima a boli
    var MINIMO = 7;
    function encoger() {
      var vueltas = 0;
      while (f.scrollHeight > f.clientHeight && vueltas++ < 80 && cuerpo > MINIMO) {
        alto *= 0.97; cuerpo *= 0.97;
        f.style.setProperty("--alto", alto.toFixed(2) + "mm");
        f.style.setProperty("--cuerpo", cuerpo.toFixed(2) + "pt");
        f.style.setProperty("--cuerpo-menor", (cuerpo * 0.85).toFixed(2) + "pt");
        f.style.setProperty("--cuerpo-cita", (cuerpo * 0.78).toFixed(2) + "pt");
      }
    }
    encoger();
    // si ni al mínimo legible cabe en media hoja, se queda la hoja entera
    if (f.scrollHeight > f.clientHeight) {
      f.classList.add("entera");
      alto = 5.2; cuerpo = 11;
      f.style.setProperty("--alto", "5.2mm");
      f.style.setProperty("--cuerpo", "11pt");
      f.style.setProperty("--cuerpo-menor", "9.35pt");
      f.style.setProperty("--cuerpo-cita", "8.58pt");
      encoger();
    }
  });
});
` + "<" + "/script>";

// Dos por hoja, con la línea de corte por el medio
export function htmlHojaFichas(fichas) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>Fichas de cobro</title><style>${estilosFicha}</style></head>
<body>${fichas.join("")}${AJUSTE}</body></html>`;
}
