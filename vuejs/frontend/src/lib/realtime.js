// Wrapper Supabase Realtime con disabilitazione automatica sul build legacy.
//
// Strategia: l'import statico di @supabase/supabase-js viene tree-shaked dal
// build legacy grazie al define costante `__MODERN__` (Vite/Rollup elimina
// il ramo `if (false)` e l'import diventa unused → drop). Sul modern build
// il client e' usato normalmente.
//
// API (compat col vecchio `src/supabase.js`):
//   - `supabase` — client Supabase o `null`
//   - `isSupabaseRealtimeConfigured` — boolean
//
// Sul legacy (Chrome 37, Android 4.4, IE11, SeaMonkey vecchi) i due valori
// sono forzati a `null` / `false`: i componenti devono fallback al polling
// (gia' presente in Orders.vue, Reservations.vue, AppLayout).

import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line no-undef
const isModern = typeof __MODERN__ !== 'undefined' ? __MODERN__ : true;

let supabase = null;
let isSupabaseRealtimeConfigured = false;

if (isModern) {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const hasPlaceholderValue = (value) => !value || value.includes('<') || value.includes('>');

  isSupabaseRealtimeConfigured = !hasPlaceholderValue(supabaseUrl) && !hasPlaceholderValue(supabaseAnonKey);
  supabase = isSupabaseRealtimeConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;
}

export { supabase, isSupabaseRealtimeConfigured };
