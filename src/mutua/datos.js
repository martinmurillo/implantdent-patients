// Todo lo que la sección de mutua le pide a Supabase.
//
// La RLS decide quién ve esto (dueño y jefe): si alguien más llega a la ruta,
// las consultas devuelven vacío en vez de datos. El guard de pantalla es para
// no enseñar una sección inútil, no la defensa.

import { supabase } from "../supabase";

// PostgREST devuelve como mucho 1000 filas por consulta y no avisa: se limita
// y ya. mutua_ultimas pasa de 2000, así que sin paginar faltarían piezas
// bloqueadas y aparecerían como disponibles, que es el error más caro que
// puede cometer esta sección.
const traerTodo = async (tabla, columnas = "*") => {
  const TAM = 1000;
  const filas = [];
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await supabase.from(tabla).select(columnas)
      .range(desde, desde + TAM - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < TAM) return filas;
  }
};

export async function cargarMutua() {
  const [pacientes, ultimas, perdidas, previstos, importacion] = await Promise.all([
    traerTodo("mutua_pacientes"),
    traerTodo("mutua_ultimas"),
    traerTodo("mutua_perdidas"),
    traerTodo("mutua_previstos"),
    supabase.from("mutua_importaciones").select("*")
      .order("id", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => data || null),
  ]);
  return { pacientes, ultimas, perdidas, previstos, importacion };
}

// El historial completo se pide solo del paciente abierto: son 3465 filas en
// total y traerlas todas para enseñar una ficha no tiene sentido.
export async function historialDe(pacienteKey) {
  const { data, error } = await supabase.from("mutua_prestaciones")
    .select("*").eq("paciente_key", pacienteKey)
    .order("fecha_realizacion", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function apuntesDe(pacienteKey) {
  const { data, error } = await supabase.from("mutua_apuntes")
    .select("*").eq("paciente_key", pacienteKey)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function guardarApunte(apunte) {
  const { error } = await supabase.from("mutua_apuntes").insert([apunte]);
  if (error) throw error;
}

export async function borrarApunte(id) {
  const { error } = await supabase.from("mutua_apuntes").delete().eq("id", id);
  if (error) throw error;
}

export async function altaPacienteManual(paciente) {
  // upsert y no insert: dar de alta dos veces al mismo no puede ser un error
  // que corte la faena, y la clave es determinista.
  const { error } = await supabase.from("mutua_pacientes_manuales")
    .upsert([paciente], { onConflict: "paciente_key" });
  if (error) throw error;
}

/**
 * Reemplaza todas las prestaciones por las del archivo nuevo. Va en un RPC
 * para que sea una transacción: si algo falla no quedan los datos a medias.
 */
export async function importarPrestaciones(archivo, filas) {
  const { data, error } = await supabase.rpc("mutua_reemplazar_datos", {
    p_archivo: archivo, p_filas: filas,
  });
  if (error) throw error;
  // Higiene: los apuntes a mano que el export ya trae dejan de hacer falta.
  const { data: limpiados } = await supabase.rpc("mutua_limpiar_apuntes");
  const r = Array.isArray(data) ? data[0] : data;
  return {
    filas: r?.out_filas ?? 0,
    pacientes: r?.out_pacientes ?? 0,
    fechaMin: r?.out_fecha_min ?? null,
    fechaMax: r?.out_fecha_max ?? null,
    apuntesLimpiados: limpiados ?? 0,
  };
}
