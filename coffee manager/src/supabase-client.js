const supabaseConfig = window.SUPABASE_CONFIG;
const supabaseConfigured = Boolean(
  window.supabase &&
  supabaseConfig &&
  supabaseConfig.url &&
  supabaseConfig.anonKey &&
  supabaseConfig.anonKey !== "PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE"
);
const supabaseClient = supabaseConfigured
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;
