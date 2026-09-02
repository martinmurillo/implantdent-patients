#!/usr/bin/env node
/**
 * Carga los bloques compartidos y las 18 plantillas en Supabase.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/cargar-seed.mjs
 *
 * Es idempotente: vuelve a ejecutarse sin duplicar. Los bloques y
 * plantillas se identifican por (codigo, version).
 *
 * Nunca sobrescribe una versión existente. Si has cambiado el texto de
 * algo ya cargado, sube el número de version en el JSON: las plantillas
 * son inmutables por diseño, porque un documento firmado tiene que
 * poder demostrar qué versión leyó el paciente.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SEED = join(AQUI, '..', 'seed');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY en el entorno.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function cargarBloques() {
  const { bloques } = JSON.parse(
    readFileSync(join(SEED, 'bloques-compartidos.json'), 'utf8'),
  );

  let nuevos = 0;
  for (const b of bloques) {
    const { data: existe } = await db
      .from('consent_bloques')
      .select('id')
      .eq('codigo', b.codigo)
      .eq('version', b.version)
      .maybeSingle();

    if (existe) {
      console.log(`  = ${b.codigo} v${b.version} ya está`);
      continue;
    }

    const { error } = await db.from('consent_bloques').insert({
      codigo: b.codigo,
      version: b.version,
      titulo: b.titulo ?? null,
      contenido: b.contenido,
      notas: b.notas ?? null,
      activo: true,
    });
    if (error) throw error;
    console.log(`  + ${b.codigo} v${b.version}`);
    nuevos++;
  }
  return nuevos;
}

async function cargarPlantillas() {
  const dir = join(SEED, 'plantillas');
  const archivos = readdirSync(dir).filter((f) => f.endsWith('.json'));

  const porEstado = {};
  let nuevas = 0;

  for (const archivo of archivos) {
    const p = JSON.parse(readFileSync(join(dir, archivo), 'utf8'));
    porEstado[p._estado] = (porEstado[p._estado] ?? 0) + 1;

    const { data: existe } = await db
      .from('consent_plantillas')
      .select('id')
      .eq('codigo', p.codigo)
      .eq('version', p.version)
      .eq('idioma', p.idioma)
      .maybeSingle();

    if (existe) {
      console.log(`  = ${p.codigo} v${p.version} ya está`);
      continue;
    }

    const { error } = await db.from('consent_plantillas').insert({
      codigo: p.codigo,
      titulo: p.titulo,
      version: p.version,
      idioma: p.idioma,
      composicion: p.composicion,
      pide_piezas: p.pide_piezas,
      profesional_por_defecto: null,   // se asigna desde la app
      // Se cargan INACTIVAS a propósito: nada se imprime hasta que
      // alguien la ha revisado contra el escaneo original y la activa.
      activa: false,
    });
    if (error) throw error;
    console.log(`  + ${p.codigo} v${p.version}  [${p._estado}]`);
    nuevas++;
  }
  return { nuevas, porEstado };
}

console.log('Bloques compartidos:');
const nb = await cargarBloques();

console.log('\nPlantillas:');
const { nuevas, porEstado } = await cargarPlantillas();

console.log(`\n${nb} bloques y ${nuevas} plantillas cargados.`);
console.log('Estado:', porEstado);
console.log(
  '\nTodas las plantillas quedan INACTIVAS. Revísalas en Ajustes >\n' +
  'Consentimientos, cotéjalas contra la carpeta originales/ y actívalas\n' +
  'una a una. Una plantilla inactiva no aparece en el botón del paciente.',
);
