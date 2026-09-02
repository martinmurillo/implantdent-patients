// Genera el SQL de carga de bloques y plantillas a partir del seed.
//
// El script original (docs/consentimientos/scripts/cargar-seed.mjs) pide
// SUPABASE_SERVICE_KEY, la clave que salta la RLS. Esto emite SQL y lo carga
// por la misma vía que las migraciones, sin que la clave secreta tenga que
// pasar por una variable de entorno ni por el historial de la terminal.
//
// Idempotente igual que el original: el ON CONFLICT no pisa lo que ya está,
// así que se puede volver a correr sin duplicar ni revertir ediciones hechas
// desde el editor.
//
//   node scripts/seed-consentimientos.mjs > carga.sql
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SEED = join(process.cwd(), "docs", "consentimientos", "seed");

// Comillas simples dobladas: es la forma segura de meter JSON en SQL sin
// depender de $$ , que podría aparecer dentro del propio texto legal.
const lit = (v) =>
  v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const json = (v) => `${lit(JSON.stringify(v))}::jsonb`;

const out = [];
out.push("-- Generado por scripts/seed-consentimientos.mjs. No editar a mano.");
out.push("begin;");

const { bloques } = JSON.parse(
  readFileSync(join(SEED, "bloques-compartidos.json"), "utf8"),
);
out.push(`\n-- ${bloques.length} bloques compartidos`);
for (const b of bloques) {
  out.push(
    `insert into consent_bloques (codigo, version, titulo, contenido, notas, activo) values (` +
      [lit(b.codigo), b.version, lit(b.titulo ?? null), json(b.contenido), lit(b.notas ?? null), "true"].join(", ") +
      `) on conflict (codigo, version) do nothing;`,
  );
}

const dir = join(SEED, "plantillas");
const archivos = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
out.push(`\n-- ${archivos.length} plantillas, todas INACTIVAS a propósito:`);
out.push("-- nada se imprime hasta que alguien la coteja contra su escaneo.");
for (const archivo of archivos) {
  const p = JSON.parse(readFileSync(join(dir, archivo), "utf8"));
  out.push(
    `insert into consent_plantillas (codigo, titulo, version, idioma, composicion, pide_piezas, profesional_por_defecto, activa) values (` +
      [lit(p.codigo), lit(p.titulo), p.version, lit(p.idioma), json(p.composicion),
       p.pide_piezas ? "true" : "false", "null", "false"].join(", ") +
      `) on conflict (codigo, version, idioma) do nothing;  -- ${p._estado}`,
  );
}

out.push("\ncommit;");
process.stdout.write(out.join("\n") + "\n");

const estados = {};
for (const a of archivos) {
  const p = JSON.parse(readFileSync(join(dir, a), "utf8"));
  estados[p._estado] = (estados[p._estado] ?? 0) + 1;
}
process.stderr.write(
  `${bloques.length} bloques, ${archivos.length} plantillas ` +
    `(${Object.entries(estados).map(([k, v]) => `${v} ${k}`).join(", ")})\n`,
);
