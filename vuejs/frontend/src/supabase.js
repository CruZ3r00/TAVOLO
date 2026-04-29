import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const hasPlaceholderValue = (value) => !value || value.includes('<') || value.includes('>');

export const isSupabaseRealtimeConfigured = !hasPlaceholderValue(supabaseUrl)
  && !hasPlaceholderValue(supabaseAnonKey);

export const supabase = isSupabaseRealtimeConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
