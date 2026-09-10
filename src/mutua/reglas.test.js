import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calcularEstadoPiezas, liberadasEnElMes, ultimoDiaDelMes,
  PERMANENTES, ANTERIORES, TEMPORALES, MESES_BLOQUEO,
} from "./reglas.js";

// Datos inventados a propósito: el archivo de la mutua lleva DNI y datos de
// salud y no entra en el repo. Los tests contra el export real están en
// scripts/verificar-mutua.mjs, que se corre a mano con el archivo delante.
const ultima = (pieza, fecha, familia = "OBTURACION") => ({
  familia, pieza, ultima_fecha: fecha,
  fecha_liberacion: sumar6(fecha), codigo: 32301,
});
const sumar6 = (f) => {
  const [y, m, d] = f.split("-").map(Number);
  const t = (m - 1) + MESES_BLOQUEO;
  const ny = y + Math.floor(t / 12), nm = ((t % 12) + 12) % 12;
  const ult = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, ult)).padStart(2, "0")}`;
};
const calc = (o) => calcularEstadoPiezas({ familia: "OBTURACION", R: "2026-09-10", ...o });
const estadoDe = (r, pieza) => r.piezas.find(p => p.pieza === pieza)?.estado;

describe("universo de piezas", () => {
  test("obturación son las 32 permanentes", () => {
    assert.equal(PERMANENTES.length, 32);
    assert.equal(calc({}).total, 32);
  });

  test("ángulos solo el sector anterior: 12 piezas", () => {
    assert.deepEqual(ANTERIORES, [11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43]);
    assert.equal(calcularEstadoPiezas({ familia: "ANGULOS", R: "2026-09-10" }).total, 12);
  });

  test("sin paso reciente por un temporal, no se ofrecen dientes de leche", () => {
    assert.equal(calc({ ultimaTemporal: null }).total, 32);
    assert.equal(calc({ ultimaTemporal: "2023-01-01" }).total, 32, "hace más de 24 meses");
  });

  test("con un temporal reciente se suman los 20", () => {
    const r = calc({ ultimaTemporal: "2026-05-01" });
    assert.equal(r.incluyeTemporales, true);
    assert.equal(r.total, 32 + TEMPORALES.length);
  });

  test("la ventana de temporales se mide contra R, no contra hoy", () => {
    // Mismo paciente, dos fechas de referencia: en la ficha entra y en un mes
    // muy posterior ya no, porque su último temporal quedó fuera de la ventana.
    const p = { ultimaTemporal: "2024-10-01" };
    assert.equal(calcularEstadoPiezas({ familia: "OBTURACION", R: "2026-09-30", ...p }).incluyeTemporales, true);
    assert.equal(calcularEstadoPiezas({ familia: "OBTURACION", R: "2026-11-30", ...p }).incluyeTemporales, false);
  });
});

describe("estado de cada pieza", () => {
  test("una pieza sin historial está disponible", () => {
    assert.equal(estadoDe(calc({}), 16), "disponible");
  });

  test("hecha hace menos de 6 meses: bloqueada, y dice hasta cuándo", () => {
    const r = calc({ ultimas: [ultima(16, "2026-08-17")] });
    assert.equal(estadoDe(r, 16), "bloqueada");
    assert.equal(r.piezas.find(p => p.pieza === 16).fechaLiberacion, "2027-02-17");
    assert.deepEqual(r.bloqueadas.map(p => p.pieza), [16]);
    assert.equal(r.disponibles.length, 31);
  });

  test("hecha hace más de 6 meses: vuelve a estar disponible, con su historial", () => {
    const r = calc({ ultimas: [ultima(16, "2025-01-31")] });
    assert.equal(estadoDe(r, 16), "con_historial");
    assert.equal(r.disponibles.length, 32);
  });

  test("el día exacto de la liberación ya cuenta como disponible", () => {
    // liberación = R: la regla es "bloqueada si libera DESPUÉS de R"
    assert.equal(estadoDe(calc({ ultimas: [ultima(16, "2026-03-10")] }), 16), "con_historial");
    assert.equal(estadoDe(calc({ ultimas: [ultima(16, "2026-03-11")] }), 16), "bloqueada");
  });

  test("de dos prestaciones en la misma pieza manda la más reciente", () => {
    // El caso de la pieza 25 de Eric: tarifa infantil vieja y tarifa adulta
    // nueva. Con la vieja estaría bloqueada; con la buena, disponible.
    const r = calc({ ultimas: [ultima(25, "2024-03-04", "OBTURACION"), ultima(25, "2025-01-31", "OBTURACION")] });
    assert.equal(estadoDe(r, 25), "con_historial");
  });

  test("las series infantil y adulta son la misma familia", () => {
    const r = calc({ ultimas: [{ ...ultima(25, "2026-08-01"), codigo: 32102 }] });
    assert.equal(estadoDe(r, 25), "bloqueada");
  });
});

describe("piezas perdidas", () => {
  test("una pieza extraída no se ofrece nunca", () => {
    const r = calc({ perdidas: [{ pieza: 24, fecha_perdida: "2022-05-10" }] });
    assert.equal(estadoDe(r, 24), "perdida");
    assert.deepEqual(r.perdidas.map(p => p.pieza), [24]);
    assert.equal(r.disponibles.length, 31);
  });

  test("extraída después de la obturación: perdida, la obturación ya da igual", () => {
    const r = calc({
      ultimas: [ultima(24, "2026-01-10")],
      perdidas: [{ pieza: 24, fecha_perdida: "2026-03-01" }],
    });
    assert.equal(estadoDe(r, 24), "perdida");
  });

  test("extraída antes y obturada después: la pieza sigue viva", () => {
    // Un implante o una extracción vieja con una prestación posterior encima
    // significa que la pieza volvió a tratarse; mandar la extracción borraría
    // una pieza que sí existe.
    const r = calc({
      ultimas: [ultima(24, "2026-06-01")],
      perdidas: [{ pieza: 24, fecha_perdida: "2026-01-10" }],
    });
    assert.equal(estadoDe(r, 24), "bloqueada");
    assert.equal(r.perdidas.length, 0);
  });
});

describe("lo que queda fuera del universo", () => {
  test("un ángulo en un molar se enseña pero no cuenta", () => {
    const r = calcularEstadoPiezas({
      familia: "ANGULOS", R: "2026-09-10",
      ultimas: [ultima(16, "2026-08-01", "ANGULOS")],
    });
    assert.equal(estadoDe(r, 16), "bloqueada", "se ve, con su estado");
    assert.equal(r.total, 12, "pero el conteo sigue siendo el sector anterior");
    assert.equal(r.bloqueadas.length, 0);
  });

  test("la familia ajena no ensucia el cálculo", () => {
    // Obturación y ángulos no se bloquean entre sí.
    const r = calc({ ultimas: [ultima(16, "2026-08-17", "ANGULOS")] });
    assert.equal(estadoDe(r, 16), "disponible");
  });
});

describe("liberaciones del mes", () => {
  test("solo las que se abren dentro del mes elegido", () => {
    const r = calcularEstadoPiezas({
      familia: "OBTURACION", R: ultimoDiaDelMes(2026, 9),
      ultimas: [ultima(16, "2026-03-17"), ultima(26, "2025-01-01"), ultima(36, "2026-06-01")],
    });
    // 16 libera el 17/09 (dentro), 26 liberó en 2025 (antes), 36 libera en diciembre
    assert.deepEqual(liberadasEnElMes(r, 2026, 9).map(p => p.pieza), [16]);
    assert.equal(estadoDe(r, 36), "bloqueada");
  });

  test("un mes sin liberaciones devuelve lista vacía, no error", () => {
    const r = calc({ ultimas: [ultima(16, "2026-03-17")] });
    assert.deepEqual(liberadasEnElMes(r, 2026, 11), []);
  });
});

describe("último día del mes", () => {
  test("meses de 30, 31 y febrero", () => {
    assert.equal(ultimoDiaDelMes(2026, 9), "2026-09-30");
    assert.equal(ultimoDiaDelMes(2026, 1), "2026-01-31");
    assert.equal(ultimoDiaDelMes(2026, 2), "2026-02-28");
    assert.equal(ultimoDiaDelMes(2028, 2), "2028-02-29");
  });
});

describe("familia desconocida", () => {
  test("falla en el momento en vez de devolver una ficha vacía", () => {
    assert.throws(() => calcularEstadoPiezas({ familia: "ENDODONCIA", R: "2026-09-10" }),
      /Familia desconocida/);
  });
});
