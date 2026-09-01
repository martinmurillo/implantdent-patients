import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://byvneusfytbliiibmilv.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_zaLVs54ogm8iyiPLRxg1Kg_5lPpxXJT'

// Se lee ANTES de crear el cliente, y a propósito. supabase-js limpia el hash
// de la URL nada más arrancar, así que para cuando React monta ya no queda
// rastro del "type=recovery" que dice que el usuario viene del enlace del
// correo. Escuchar el evento PASSWORD_RECOVERY no basta: se dispara durante
// esa limpieza, antes de que nadie se haya suscrito.
export const hashDeEntrada = typeof window !== "undefined" ? window.location.hash : ""

export const supabase = createClient(url, key)
