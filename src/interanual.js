// Comparación interanual del progreso: los mismos meses de un año contra los
// del año anterior. Comparar mayo-octubre con enero-abril del mismo año mezcla
// el efecto de Martin con la estacionalidad (agosto y diciembre bajan siempre);
// contra los mismos meses del año pasado esa diferencia desaparece.
//
// Un mes solo cuenta si tiene dato en los dos años. Los meses sin cargar vienen
// a cero (el mes en curso, o 2025 sin presupuestado ni implantes), y tomarlos
// como un cero real daría un crecimiento inventado.

const pct = (a, b) => Math.round((a - b) / b * 1000) / 10;

export function comparaInteranual(actual = [], anterior = [], desde = 0, hasta = 11) {
  const porMes = [];
  for (let i = desde; i <= hasta; i++) {
    const a = actual[i] || 0, b = anterior[i] || 0;
    const comparable = a > 0 && b > 0;
    porMes.push({
      mes: i,
      actual:   a || null,
      anterior: b || null,
      dif: comparable ? a - b : null,
      pct: comparable ? pct(a, b) : null,
    });
  }
  const meses = porMes.filter(m => m.dif != null);
  const tA = meses.reduce((s, m) => s + m.actual, 0);
  const tB = meses.reduce((s, m) => s + m.anterior, 0);
  return {
    meses:    meses.map(m => m.mes),
    actual:   meses.length ? tA : null,
    anterior: meses.length ? tB : null,
    dif:      meses.length ? tA - tB : null,
    pct:      meses.length ? pct(tA, tB) : null,
    porMes,
  };
}
