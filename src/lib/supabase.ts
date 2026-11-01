import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Bağlantı bilgileri derleme sırasında GitHub Secrets'tan gelir (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// Böylece arkadaşın hiçbir ayar yapmadan giriş yapabilir. Ayarlar > Gelişmiş'ten elle de değiştirilebilir.
const LS_KEY = 'vault.supabase';

export interface SupaConfig {
  url: string;
  anonKey: string;
}

export function getSupaConfig(): SupaConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const c = JSON.parse(raw) as SupaConfig;
      if (c.url && c.anonKey) return c;
    }
  } catch {
    /* yok say */
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

export function setSupaConfig(c: SupaConfig | null) {
  if (c) localStorage.setItem(LS_KEY, JSON.stringify(c));
  else localStorage.removeItem(LS_KEY);
  client = null;
}

let client: SupabaseClient | null = null;

export function supa(): SupabaseClient | null {
  if (client) return client;
  const c = getSupaConfig();
  if (!c) return null;
  client = createClient(c.url, c.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vault.auth' },
  });
  return client;
}
