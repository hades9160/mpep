// ============================================================================
// SUPABASE CONFIG — reads from .env (see .env.example).
// Never hardcode keys here; Vite injects them at build/dev time.
// ============================================================================
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    'Missing Supabase env vars. Copy .env.example to .env and fill in your project URL and anon key.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
