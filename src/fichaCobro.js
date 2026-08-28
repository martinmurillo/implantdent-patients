// ─── Ficha de cobro para recepción ───────────────────────────────────────────
// Media A4 para recortar y tener en el mostrador. El paciente viene a
// pagar, recepción busca su ficha, apunta cuánto pagó y cómo, y ve de un
// vistazo si con ese pago le toca dar cita para algo.
//
// La ficha va en dos columnas: a la izquierda los datos del paciente y las
// citas que hay que dar, a la derecha la rejilla de cuotas de arriba abajo.
// Así lo que se escribe a boli queda todo junto en una sola columna.
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
         display:flex;flex-direction:row;gap:6mm;overflow:hidden;}
  .ficha.entera{height:297mm;}
  .izq{width:41%;display:flex;flex-direction:column;min-width:0;}
  .der{flex:1;min-width:0;height:100%;}
  /* la tabla ocupa todo el alto de la columna: las filas se reparten el
     espacio sobrante en vez de amontonarse arriba, que es lo que hace falta
     para escribir a boli cómodo */
  .der table{height:var(--tabla);}

  .nombre{font-size:15pt;font-weight:800;line-height:1.05;text-transform:uppercase;}
  .hc{font-size:9.5pt;color:#555;margin-top:0.6mm;
      border-bottom:2.5px solid #c9a84c;padding-bottom:1.4mm;}
  .hoy{margin-top:2.4mm;}
  .hoy .lbl{font-size:8pt;letter-spacing:.1em;color:#888;display:block;}
  .hoy .imp{font-size:21pt;font-weight:800;color:#0e3b3e;line-height:1;}
  .plan{font-size:9pt;font-weight:700;color:#a07830;margin-top:1.6mm;
        letter-spacing:.03em;text-transform:uppercase;line-height:1.2;}

  /* Citas a dar: van con la cuota que las dispara, no con el mes del plan,
     porque recepción razona por cobro ("cuando pague la 3, le doy cita"). */
  .citas{margin-top:3mm;border-top:1px solid #ccc;padding-top:1.6mm;}
  .citas .tit{font-size:8pt;font-weight:700;letter-spacing:.08em;color:#777;
              text-transform:uppercase;margin-bottom:1.2mm;}
  .cit{font-size:var(--cuerpo-cita);line-height:1.2;margin-bottom:1.4mm;color:#0e3b3e;}
  .cit .cuando{font-weight:800;}
  .cit .que{display:block;font-style:italic;}
  .sincitas{font-size:var(--cuerpo-cita);color:#999;font-style:italic;}

  /* Cuadrícula cerrada: recepción escribe a boli dentro de cada casilla, así
     que las celdas tienen que estar delimitadas por los cuatro lados.
     Anchos fijos: si no, la última columna se come todo el espacio sobrante
     y las casillas de escribir quedan desiguales. */
  table{width:100%;border-collapse:collapse;border:1.2px solid #555;table-layout:fixed;}
  th{font-size:8pt;text-transform:uppercase;letter-spacing:.04em;color:#555;
     text-align:left;border:1px solid #555;background:#f0eee9;
     padding:0.8mm 1.5mm;font-weight:700;}
  /* el alto de fila y el cuerpo los fija cada ficha según cuántas cuotas
     tenga: un plan de 24 meses no puede usar la misma letra que uno de 6 */
  td{font-size:var(--cuerpo);padding:0.4mm 1.5mm;border:1px solid #888;
     height:var(--alto);vertical-align:middle;}
  .f{width:27%;font-weight:600;}
  .c{width:21%;text-align:right;font-weight:700;}
  /* la casilla en blanco es la que recepción rellena a boli */
  .w{width:31%;background:#fff;}
  .forma{width:21%;font-size:var(--cuerpo-menor);color:#aaa;
         letter-spacing:.1em;text-align:center;}
  tr.pagada td{color:#999;background:#f7f7f5;}
  tr.pagada .c{text-decoration:line-through;}
  .ok{font-size:var(--cuerpo-menor);font-weight:800;color:#1c523b;letter-spacing:.06em;}

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
    return `
      <tr class="${pagada ? "pagada" : ""}">
        <td class="f">${fecha(c.vence_el)}</td>
        <td class="c">${eur(c.importe)}</td>
        <td class="w">${pagada ? '<span class="ok">COBRADO</span>' : ""}</td>
        <td class="forma">${pagada ? "" : "V · E · T"}</td>
      </tr>`;
  }).join("");

  // La cuota 0 es la entrega inicial, no lleva número de orden
  const conCita = orden
    .map(c => ({ c, que: porMes.get(c.mes) || [] }))
    .filter(x => x.que.length);
  const citas = conCita.length
    ? conCita.map(({ c, que }) => `
      <div class="cit">
        <span class="cuando">${c.numero === 0 ? "Entrega" : `Cuota ${c.numero}`} · ${fecha(c.vence_el)}</span>
        <span class="que">${esc(que.join(", "))}</span>
      </div>`).join("")
    : '<div class="sincitas">Sin citas programadas</div>';

  const resumenPlan = plan.modo === "cuotas"
    ? `${plan.n_cuotas} cuotas de ${eur(plan.importe_cuota)} €`
    : "Paga según se va haciendo";

  // Alto disponible para la tabla: la columna derecha ocupa la ficha entera,
  // sólo hay que descontar los márgenes y la cabecera de la tabla.
  const ALTO_TABLA_MM = 129;
  const alto = Math.max(2.6, Math.min(12, ALTO_TABLA_MM / Math.max(1, orden.length)));
  // a 5,5 mm de fila le sientan 11pt; de ahí sale la proporción, con tope
  // arriba para que en planes cortos no salgan números desproporcionados
  const cuerpo = Math.max(6, Math.min(11, alto * 2));
  // La tabla estira hasta llenar la columna, pero sin pasar de 12 mm por fila:
  // un plan de 5 cuotas no necesita renglones de dos centímetros.
  const tabla = `min(100%, ${(alto * orden.length + 7).toFixed(1)}mm)`;

  const medidas = `--tabla:${tabla};`
    + `--alto:${alto.toFixed(2)}mm;`
    + `--cuerpo:${cuerpo.toFixed(1)}pt;`
    + `--cuerpo-menor:${(cuerpo * 0.85).toFixed(1)}pt;`
    + `--cuerpo-cita:${(cuerpo * 0.8).toFixed(1)}pt;`;

  return `
  <div class="ficha" style="${medidas}">
    <div class="izq">
      <div class="nombre">${esc(paciente?.name || plan.patient_name || "")}</div>
      <div class="hc">HC ${esc(paciente?.hc || "—")} · Presupuesto ${esc(plan.budget_no || "—")}</div>
      <div class="hoy">
        <span class="lbl">A PAGAR AHORA</span>
        <span class="imp">${eur(aPagarAhora)} €</span>
      </div>
      <div class="plan">Plan de pago · ${resumenPlan}</div>
      <div class="citas">
        <div class="tit">Citas a dar</div>
        ${citas}
      </div>
      <div class="pie">
        V = Visa · E = Efectivo · T = Transferencia.<br/>
        Si paga de menos, anotar la diferencia y sumarla a la <b>cuota siguiente</b>.
      </div>
    </div>
    <div class="der">
      <table>
        <thead><tr>
          <th class="f">Vence</th><th class="c">Cuota</th>
          <th class="w">Pagado</th><th class="forma">Forma</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  </div>`;
}

// El cálculo de arriba es una estimación: el alto real depende de cuánto texto
// lleven las citas y de si se parten. Antes de imprimir, cada ficha se mide de
// verdad y se encoge hasta caber. Así no hay plan, por largo que sea, que se
// salga de la media hoja.
const AJUSTE = `
<script>
addEventListener("load", function () {
  document.querySelectorAll(".ficha").forEach(function (f) {
    var css = getComputedStyle(f);
    var alto = parseFloat(css.getPropertyValue("--alto"));
    var cuerpo = parseFloat(css.getPropertyValue("--cuerpo"));
    // 7pt es el suelo: por debajo no se puede escribir encima a boli
    var MINIMO = 7;
    function desborda() {
      return f.scrollHeight > f.clientHeight
        || [].some.call(f.children, function (col) { return col.scrollHeight > col.clientHeight; });
    }
    function aplicar() {
      f.style.setProperty("--alto", alto.toFixed(2) + "mm");
      f.style.setProperty("--cuerpo", cuerpo.toFixed(2) + "pt");
      f.style.setProperty("--cuerpo-menor", (cuerpo * 0.85).toFixed(2) + "pt");
      f.style.setProperty("--cuerpo-cita", (cuerpo * 0.8).toFixed(2) + "pt");
    }
    function encoger() {
      var vueltas = 0;
      while (desborda() && vueltas++ < 80 && cuerpo > MINIMO) {
        alto *= 0.97; cuerpo *= 0.97; aplicar();
      }
    }
    encoger();
    // si ni al mínimo legible cabe en media hoja, se queda la hoja entera
    if (desborda()) {
      f.classList.add("entera");
      // en hoja entera hay alto de sobra: que la tabla lo aproveche todo
      f.style.setProperty("--tabla", "100%");
      alto = 12; cuerpo = 11; aplicar();
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
