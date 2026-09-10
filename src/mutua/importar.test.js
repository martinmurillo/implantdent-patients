import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarFilas, resumenImportacion, avisoDeRetroceso,
  aFecha, normalizarNombre, normalizarDni, claveDePaciente, COLUMNAS_EXCEL,
} from "./importar.js";

const fila = (extra = {}) => ({
  "Información de Paciente": "JUAN PEREZ", "DNI del paciente": "12345678Z",
  "código": 32301, "Tratamiento": "Obturación simple o compuesta *",
  "Precio": 0, "Pieza": 16, "Producto": "AGRUPACIO", "Creado el": "31/08/2026",
  "Facturado": "31/08/2026", "Fecha Alb/Fact": "31/08/2026", "Devuelto": null,
  "Fecha de Realización": "17/08/2026", ...extra,
});

describe("fechas del export", () => {
  test("dd/mm/aaaa, que es lo que manda hoy el portal", () => {
    assert.equal(aFecha("17/08/2026"), "2026-08-17");
    assert.equal(aFecha("3/4/2021"), "2021-04-03");
  });

  test("también una fecha nativa de Excel", () => {
    assert.equal(aFecha(new Date(2026, 7, 17)), "2026-08-17");
  });

  test("una fecha nativa no se corre un día por la zona horaria", () => {
    // toISOString() en Madrid devolvería el 16 para un 17 a medianoche.
    assert.equal(aFecha(new Date(2026, 7, 17, 0, 30)), "2026-08-17");
  });

  test("vacío es vacío, no una fecha inventada", () => {
    for (const v of [null, "", undefined]) assert.equal(aFecha(v), null);
  });

  test("una fecha ilegible no se cuela como válida", () => {
    assert.equal(aFecha("no es una fecha"), null);
  });
});

describe("normalizar paciente", () => {
  test("el nombre pierde tildes, espacios de más y va a mayúsculas", () => {
    assert.equal(normalizarNombre("  mía   julieth  cañadas galán "),
                 "MIA JULIETH CANADAS GALAN");
  });

  test("el DNI va en mayúsculas y sin espacios", () => {
    assert.equal(normalizarDni(" 41674423x "), "41674423X");
    assert.equal(normalizarDni("   "), null);
  });

  test("sin DNI se identifica por el nombre, con prefijo", () => {
    assert.equal(claveDePaciente(null, "Mía Cañadas"), "NOM:MIA CANADAS");
  });

  test("el prefijo evita confundir un nombre con un DNI", () => {
    assert.notEqual(claveDePaciente(null, "12345678Z"), claveDePaciente("12345678Z", "otro"));
  });

  test("dos escrituras del mismo nombre dan la misma clave", () => {
    assert.equal(claveDePaciente(null, "MIA  CAÑADAS"), claveDePaciente(null, "mia cañadas"));
  });
});

describe("normalizar filas", () => {
  test("una fila típica sale lista para la base", () => {
    const { filas } = normalizarFilas([fila()]);
    assert.deepEqual(filas[0], {
      paciente_key: "12345678Z", dni: "12345678Z", nombre: "JUAN PEREZ",
      codigo: 32301, tratamiento: "Obturación simple o compuesta *", precio: 0,
      pieza: 16, producto: "AGRUPACIO", creado_el: "2026-08-31",
      facturado: "2026-08-31", fecha_alb_fact: "2026-08-31", devuelto: null,
      fecha_realizacion: "2026-08-17",
    });
  });

  test("si falta una columna no se importa nada", () => {
    const sinPieza = fila(); delete sinPieza["Pieza"];
    const r = normalizarFilas([sinPieza]);
    assert.deepEqual(r.faltan, ["Pieza"]);
    assert.equal(r.filas.length, 0, "ni una fila a medias");
  });

  test("las 12 columnas del portal, ni una menos", () => {
    assert.equal(COLUMNAS_EXCEL.length, 12);
    assert.equal(normalizarFilas([fila()]).faltan.length, 0);
  });

  test("una fila sin fecha de realización se descarta y se cuenta", () => {
    const r = normalizarFilas([fila(), fila({ "Fecha de Realización": null })]);
    assert.equal(r.filas.length, 1);
    assert.equal(r.descartadas, 1);
  });

  test("la pieza vacía se queda en null, no en cero", () => {
    // Un cero sería la pieza 0, que no existe, y entraría en los cálculos.
    assert.equal(normalizarFilas([fila({ "Pieza": null })]).filas[0].pieza, null);
  });

  test("no se deduplica: hay filas idénticas legítimas", () => {
    // Dos radiografías el mismo día son dos prestaciones, no un error.
    assert.equal(normalizarFilas([fila(), fila()]).filas.length, 2);
  });

  test("un archivo vacío no revienta", () => {
    const r = normalizarFilas([]);
    assert.deepEqual(r.filas, []);
    assert.deepEqual(r.faltan, COLUMNAS_EXCEL, "sin cabecera, faltan todas");
  });
});

describe("resumen de la importación", () => {
  test("cuenta filas, pacientes y el rango de fechas", () => {
    const { filas } = normalizarFilas([
      fila(),
      fila({ "DNI del paciente": "99999999R", "Fecha de Realización": "01/02/2020" }),
      fila({ "Fecha de Realización": "28/08/2026" }),
    ]);
    assert.deepEqual(resumenImportacion(filas), {
      filas: 3, pacientes: 2, fechaMin: "2020-02-01", fechaMax: "2026-08-28",
    });
  });
});

describe("aviso de retroceso", () => {
  const actual = { filas: 3465, fechaMin: "2020-01-20" };

  test("un archivo con menos filas avisa antes de reemplazar", () => {
    const aviso = avisoDeRetroceso({ filas: 900, fechaMin: "2020-01-20" }, actual);
    assert.match(aviso, /900 filas vs 3465/);
  });

  test("un archivo que empieza más tarde también avisa", () => {
    const aviso = avisoDeRetroceso({ filas: 4000, fechaMin: "2024-01-01" }, actual);
    assert.match(aviso, /empieza más tarde/);
  });

  test("un archivo normal, más grande y con el mismo arranque, no avisa", () => {
    assert.equal(avisoDeRetroceso({ filas: 3600, fechaMin: "2020-01-20" }, actual), null);
  });

  test("la primera importación no tiene con qué comparar", () => {
    assert.equal(avisoDeRetroceso({ filas: 10, fechaMin: "2026-01-01" }, null), null);
    assert.equal(avisoDeRetroceso({ filas: 10, fechaMin: "2026-01-01" }, { filas: 0 }), null);
  });
});
