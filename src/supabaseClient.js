import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Variabili REACT_APP_SUPABASE_URL e REACT_APP_SUPABASE_ANON_KEY mancanti nel file .env');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
