import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://byvneusfytbliiibmilv.supabase.co'
const SUPABASE_KEY = 'sb_publishable_zaLVs54ogm8iyiPLRxg1Kg_5lPpxXJT'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)