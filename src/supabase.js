import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://byvneusfytbliiibmilv.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_zaLVs54ogm8iyiPLRxg1Kg_5lPpxXJT'

export const supabase = createClient(url, key)
