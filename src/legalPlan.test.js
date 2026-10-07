import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PAGO } from "./legalPlan.js";

// El IBAN sale impreso en la hoja de resumen y en los avisos de pago: un
// dígito cambiado manda las transferencias de los pacientes a ninguna parte.
// Ya pasó una vez (acababa en 0 y era 1), así que se comprueban los dos
// controles que lleva: el del IBAN y el de la cuenta española.
describe("IBAN de la clínica", () => {
  const limpio = PAGO.iban.replace(/\s+/g, "");

  test("cuadra el control del IBAN (módulo 97)", () => {
    const reordenado = limpio.slice(4) + limpio.slice(0, 4);
    const numerico = [...reordenado].map(c => parseInt(c, 36)).join("");
    assert.equal(BigInt(numerico) % 97n, 1n);
  });

  test("cuadran los dígitos de control de la cuenta española", () => {
    const pesos = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6];
    const dc = (digitos) => {
      const r = 11 - ([...digitos].reduce((a, d, i) => a + Number(d) * pesos[i], 0) % 11);
      return r === 11 ? 0 : r === 10 ? 1 : r;
    };
    const bban = limpio.slice(4);              // entidad(4) oficina(4) DC(2) cuenta(10)
    const esperado = `${dc("00" + bban.slice(0, 8))}${dc(bban.slice(10))}`;
    assert.equal(bban.slice(8, 10), esperado);
  });
});
