import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

// Requests that hang (weak gym signal, phone froze the app mid-request) fail after 20s, so the sync queue can retry
const fetchWithTimeout = (input, init = {}) =>
  fetch(input, init.signal ? init : { ...init, signal: AbortSignal.timeout(20000) });

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
});
