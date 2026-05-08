// Re-export sottile per retro-compatibilita': la logica e' in `@/lib/realtime`,
// che gestisce automaticamente la disabilitazione del client su legacy build.
// Per nuovo codice importare direttamente da '@/lib/realtime'.

export { supabase, isSupabaseRealtimeConfigured } from './lib/realtime.js';
