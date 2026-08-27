// Genera la hoja impresa del plan con datos de ejemplo, para poder revisar el
// resultado sin abrir la app:
//   node scripts/preview-plan.mjs && chrome --headless --print-to-pdf=...
// Ver README de la carpeta o el comando en el historial de git.
import { writeFileSync } from "node:fs";
import { calcPlan } from "../src/planCalc.js";
import { htmlPlanImpreso } from "../src/planPrint.js";
import { calcFrakmenta, lineaDeTiempo } from "../src/frakmenta.js";

const tx = [
  ["IMPLANTE ESTANDAR", 764.15, 1], ["IMPLANTE ESTANDAR", 764.15, 1], ["INJERTO OSEO", 428.75, 1],
  ["ESTUDIO IMPLANTOLOGICO", 400, 2], ["PROVISIONAL INMEDIATO", 210, 2], ["LIMPIEZA BUCAL", 61.5, 2],
  ["MULTI UNIT RECTO", 180, 3], ["MULTI UNIT ANGULADO", 180, 3],
  ["PILAR DE CICATRIZACION", 95, 4], ["RADIOGRAFIA PANORAMICA", 45, 4],
  ["CORONA SOBRE IMPLANTE", 828.75, 5], ["CORONA SOBRE IMPLANTE", 828.75, 5],
  ["FERULA DE DESCARGA", 250, 6], ["REVISION ANUAL", 97.65, 6],
].map(([nombre, importe, mes], i) => ({ id: "t" + i, nombre, importe, mes, pieza: "" }));

const plan = { modo: "cuotas", nMeses: 6, fechaInicio: "2026-08-26" };
const entrega = 2000, nCuotas = 5, cuota = 426.74, inicioQ = 2;
const calc = calcPlan({
  tratamientos: tx, nMeses: 6, modo: "cuotas",
  entrega, techoMes: 0, nCuotas, importeCuota: cuota, mesInicioCuotas: inicioQ,
});

// entrega de 2.000 financiada con Frakmenta a 12 cuotas
const frag = calcFrakmenta({ importe: entrega, plazo: 12 });
const nMesesLinea = Math.min(24, Math.max(plan.nMeses, frag.plazo));
const porMesClinica = Array.from({ length: nMesesLinea }, (_, i) => {
  const v = calc.porMes[i] || 0;
  return i === 0 ? Math.max(0, Math.round((v - entrega) * 100) / 100) : v;
});
const linea = lineaDeTiempo({ porMesClinica, frakmenta: frag, nMeses: nMesesLinea });
const desembolsoTotal = Math.round((calc.totalPlan + frag.comision) * 100) / 100;

const html = htmlPlanImpreso({
  plan,
  paciente: { name: "ROSA ISABEL GOMEZ FLORES", budget_no: "74085" },
  der: { txConMes: tx, entrega, nCuotas, inicioQ, cuota, calc,
         frag, linea, nMesesLinea, desembolsoTotal },
});

const salida = process.argv[2] || "preview-plan.html";
writeFileSync(salida, html);
console.log("escrito:", salida);
