import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Bağlantı bilgileri derleme sırasında GitHub Secrets'tan gelir (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// Böylece arkadaşın hiçbir ayar yapmadan giriş yapabilir. Ayarlar > Gelişmiş'ten elle de değiştirilebilir.
const LS_KEY = 'vault.supabase';

export interface SupaConfig {
  url: string;
  anonKey: string;
}

/**
 * Proje adresini "https://<ref>.supabase.co" biçimine indirger.
 * Sık yapılan yapıştırma hataları: sonda /rest/v1/, /auth/v1, eğik çizgi, tırnak, boşluk,
 * ya da panel adresi (supabase.com/dashboard/project/<ref>). Bunlar istekleri
 * "/rest/v1/auth/v1/signup" gibi yanlış yollara gönderip
 * "Invalid path specified in request URL" hatasına yol açar.
 */
export function normalizeSupaUrl(raw: string): string {
  let s = (raw ?? '').trim().replace(/^['"`]+|['"`]+$/g, '').trim();
  if (!s) return '';
  const dash = s.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    return new URL(s).origin;
  } catch {
    return s.replace(/\/+$/, '');
  }
}

function clean(c: { url?: string; anonKey?: string } | null | undefined): SupaConfig | null {
  const url = normalizeSupaUrl(c?.url ?? '');
  const anonKey = (c?.anonKey ?? '').trim().replace(/^['"`]+|['"`]+$/g, '').replace(/\s+/g, '');
  return url && anonKey ? { url, anonKey } : null;
}

export function getSupaConfig(): SupaConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const c = clean(JSON.parse(raw));
      if (c) return c;
    }
  } catch {
    /* yok say */
  }
  return clean({
    url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  });
}

/** Ayarlar'dan elle girilen bir yapılandırma varsa true (derlemeye gömülü olanı geçersiz kılar). */
export function hasSupaOverride(): boolean {
  try {
    return !!localStorage.getItem(LS_KEY);
  } catch {
    return false;
  }
}

export function setSupaConfig(c: SupaConfig | null) {
  const cc = clean(c);
  if (cc) localStorage.setItem(LS_KEY, JSON.stringify(cc));
  else localStorage.removeItem(LS_KEY);
  client = null;
}

/** Supabase'in İngilizce hata mesajlarını kullanıcının anlayacağı bir açıklamaya çevirir. */
export function explainSupaError(msg: string, lang: 'tr' | 'en'): string {
  const tr = lang === 'tr';
  const m = msg.toLowerCase();
  if (m.includes('invalid path specified') || m.includes('requested path is invalid') || m.includes('no route matched'))
    return tr
      ? 'Supabase adresi hatalı. Sadece https://xxxx.supabase.co olmalı (sonunda /rest/v1 vb. olmamalı).'
      : 'Wrong Supabase URL. It must be just https://xxxx.supabase.co (no /rest/v1 etc.).';
  if (m.includes('invalid api key') || m.includes('no api key') || m.includes('jwt') || m.includes('invalid jws'))
    return tr ? 'Supabase anahtarı hatalı. Project Settings > API\'deki "anon public" anahtarını kullan.' : 'Wrong Supabase key. Use the "anon public" key from Project Settings > API.';
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed'))
    return tr ? 'Sunucuya ulaşılamadı. İnternetini ve Supabase adresini kontrol et (proje duraklatılmış olabilir).' : 'Could not reach the server. Check your connection and the Supabase URL (the project may be paused).';
  if (m.includes('invalid login credentials')) return tr ? 'E-posta veya şifre yanlış.' : 'Wrong email or password.';
  if (m.includes('email not confirmed')) return tr ? 'E-postanı onaylamadın. Gelen kutundaki bağlantıya tıkla.' : 'Email not confirmed. Click the link in your inbox.';
  if (m.includes('user already registered')) return tr ? 'Bu e-posta zaten kayıtlı. "Giriş yap"ı kullan.' : 'This email is already registered. Use "Sign in".';
  if (m.includes('rate limit')) return tr ? 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.' : 'Too many attempts. Wait a bit and try again.';
  if (m.includes('password should be')) return tr ? 'Şifre en az 6 karakter olmalı.' : 'Password must be at least 6 characters.';
  return msg;
}

/** Adres ve anahtarı giriş yapmadan sınar: auth sunucusunun ayarlarını ister. */
export async function testSupaConfig(c: SupaConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const cc = clean(c);
  if (!cc) return { ok: false, error: 'missing' };
  try {
    const r = await fetch(`${cc.url}/auth/v1/settings`, { headers: { apikey: cc.anonKey } });
    if (r.ok) return { ok: true };
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      msg = j.message ?? j.msg ?? j.error_description ?? j.error ?? msg;
    } catch {
      /* gövde json değil */
    }
    return { ok: false, error: String(msg) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
