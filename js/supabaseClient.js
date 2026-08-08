// ============================================================================
// SUPABASE CONFIG — fill these in with YOUR project's values.
// Find them in Supabase: Project Settings > API
// ============================================================================
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

// Loaded from the Supabase CDN script tag in each HTML page.
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
