import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mensajePropuesta, nombreDePila } from "./mensajePropuesta.js";
import { calcFrakmenta } from "./frakmenta.js";

const base = {
  paciente: { name: "CHAIMAE EL HADI" },
  plan: { patient_name: "CHAIMAE EL HADI" },
  der: {
    calc: { totalTratamiento: 3368.55 },
    entrega: 2000,
    nCuotas: 5,
    cuota: 426.74,
    frag: null,
  },
};

// El frag sale de calcFrakmenta y no a mano: si los importes del mensaje se
// escriben a ojo, acaban diciéndole al paciente una comisión que no es la de la
// tarifa. 2.000 € a 12 meses son 105 € de comisión.
const conFrakmenta = {
  ...base,
  der: { ...base.der, frag: calcFrakmenta({ importe: 2000, plazo: 12 }) },
};

describe("nombreDePila", () => {
  test("se queda con el primer nombre y lo capitaliza", () => {
    assert.equal(nombreDePila("CHAIMAE EL HADI"), "Chaimae");
    assert.equal(nombreDePila("maría josé garcía"), "María");
    assert.equal(nombreDePila("  ROSA  "), "Rosa");
  });

  test("no revienta sin nombre", () => {
    assert.equal(nombreDePila(""), "");
    assert.equal(nombreDePila(undefined), "");
  });
});

describe("mensajePropuesta", () => {
  test("saluda por el nombre de pila y se despide igual", () => {
    const m = mensajePropuesta(base);
    assert.match(m, /^Hola Chaimae, ¿qué tal\?/);
    assert.match(m, /Un saludo, Chaimae\.$/);
  });

  test("se presenta como una excepción pedida para el paciente", () => {
    const m = mensajePropuesta(base);
    assert.match(m, /es una excepción para vos/);
    assert.match(m, /no es nuestra condición de siempre/);
    assert.match(m, /sin intereses y sin financiera de por medio/);
  });

  test("explica el método con los importes del plan", () => {
    const m = mensajePropuesta(base);
    assert.match(m, /entrega inicial de \*2\.000,00 €\*/);
    // el resto es el total menos la entrega, no el total
    assert.match(m, /El resto, 1\.368,55 €, en \*5 cuotas de 426,74 €\*/);
    assert.match(m, /qué se hace cada mes/);
  });

  test("con Frakmenta da las cuotas y la comisión, y aclara sobre qué se aplica", () => {
    const m = mensajePropuesta(conFrakmenta);
    assert.match(m, /12 cuotas \(la primera de 271,67 € y el resto de 166,67 €\)/);
    assert.match(m, /comisión única de \*105,00 €\*/);
    assert.match(m, /esos 105,00 € son por financiar la entrega, no el tratamiento/);
  });

  test("sin Frakmenta elegida igual la ofrece, sin inventar importes", () => {
    const m = mensajePropuesta(base);
    assert.match(m, /muy económica y cubre nada más que esa parte/);
    assert.doesNotMatch(m, /comisión única/);
  });

  test("siempre ofrece pagar la entrega con dinero propio y sin coste", () => {
    const m = mensajePropuesta(base);
    assert.match(m, /\*Con tu dinero\*/);
    assert.match(m, /no pagas nada de más: 3\.368,55 € y ya está/);
  });

  test("sin entrega no habla de la entrega ni de Frakmenta", () => {
    const m = mensajePropuesta({ ...base, der: { ...base.der, entrega: 0 } });
    assert.doesNotMatch(m, /LA ENTREGA/);
    assert.doesNotMatch(m, /Frakmenta/);
    // y el método se renumera solo
    assert.match(m, /1\. El resto/);
  });

  test("no deja huecos si el plan viene a medias", () => {
    const m = mensajePropuesta({ paciente: { name: "Rosa" }, plan: {}, der: {} });
    assert.match(m, /^Hola Rosa/);
    assert.doesNotMatch(m, /undefined|NaN|null/);
  });
});
