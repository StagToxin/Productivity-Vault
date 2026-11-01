// Tarihler yerel saatle "YYYY-MM-DD" string olarak tutulur; saat dilimi kaymalarından etkilenmez.

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

let dayStartHour = 0;
export function setDayStartHour(h: number) {
  dayStartHour = h;
}

/** Bugünün anahtarı. dayStartHour > 0 ise gece yarısından sonra hâlâ "dün" sayılır. */
export function todayKey(now = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  return toKey(d);
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function diffDays(a: string, b: string): number {
  // a - b gün olarak (DST güvenli: öğlene sabitle)
  const da = fromKey(a);
  const db = fromKey(b);
  da.setHours(12);
  db.setHours(12);
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

/** Haftanın başlangıcı (Pazartesi veya Pazar). */
export function startOfWeek(key: string, monday = true): string {
  const d = fromKey(key);
  const dow = d.getDay(); // 0=Pazar
  const offset = monday ? (dow + 6) % 7 : dow;
  return addDays(key, -offset);
}

export function startOfMonth(key: string): string {
  return key.slice(0, 8) + '01';
}

export function daysInMonth(key: string): number {
  const d = fromKey(key);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(startOfMonth(key));
  d.setMonth(d.getMonth() + n);
  return toKey(d);
}

export function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/** ISO 8601 hafta numarası */
export function isoWeek(key: string): number {
  const d = fromKey(key);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

export function weekdayIndex(key: string, monday = true): number {
  const dow = fromKey(key).getDay();
  return monday ? (dow + 6) % 7 : dow;
}
