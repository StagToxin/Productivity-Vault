// Görev hesaplamaları (saf fonksiyonlar): hedefli görev ilerlemesi, tik şartları, tempo, tekrar, sonuç.
import { addDays, addMonthsKeepDay, dayKeyOfTs, dayStartTs, diffDays, keyOfTs } from './dates';
import type { FocusSession, Task, TaskCheck } from './types';

export const isTargeted = (t: Pick<Task, 'target'>) => (t.target ?? 0) >= 2;
export const startOf = (t: Pick<Task, 'startDate' | 'dueDate'>) => t.startDate && t.dueDate && t.startDate < t.dueDate ? t.startDate : t.dueDate;
export const isMultiDay = (t: Pick<Task, 'startDate' | 'dueDate'>) => !!t.startDate && !!t.dueDate && t.startDate < t.dueDate;

/** Görevin verilen gün aralığına düşüp düşmediği (çok günlü görevler her gününde görünür). */
export function onDay(t: Pick<Task, 'startDate' | 'dueDate'>, k: string): boolean {
  if (!t.dueDate) return false;
  const s = startOf(t)!;
  return k >= s && k <= t.dueDate;
}

export function checksOf(checks: TaskCheck[], taskId: string): TaskCheck[] {
  return checks.filter((c) => c.taskId === taskId && !c.deleted).sort((a, b) => a.at - b.at);
}

export interface Progress {
  count: number;
  target: number;
  pct: number; // 0..1
  complete: boolean;
}

/** Hedefli görevde tik sayısı, değilse alt adımlara göre ilerleme. */
export function taskProgress(t: Task, mine: TaskCheck[]): Progress {
  if (isTargeted(t)) {
    const target = t.target!;
    const count = mine.length;
    return { count, target, pct: Math.min(1, count / target), complete: count >= target || t.status === 'done' };
  }
  if (t.status === 'done') return { count: 1, target: 1, pct: 1, complete: true };
  const cl = t.checklist ?? [];
  if (cl.length) {
    const d = cl.filter((x) => x.done).length;
    return { count: d, target: cl.length, pct: d / cl.length, complete: false };
  }
  return { count: 0, target: 1, pct: 0, complete: false };
}

export type CheckBlock =
  | { ok: true }
  | { ok: false; reason: 'complete' }
  | { ok: false; reason: 'notStarted'; date: string }
  | { ok: false; reason: 'gap' | 'perDay'; nextAt: number }
  | { ok: false; reason: 'focus'; need: number; have: number };

/** Göreve bağlı, son tikten sonra yapılmış odak dakikaları. */
export function focusSinceLastCheck(t: Task, mine: TaskCheck[], focus: FocusSession[]): number {
  const last = mine.length ? mine[mine.length - 1].at : 0;
  const used = new Set(mine.map((c) => c.focusId).filter(Boolean));
  let sum = 0;
  for (const f of focus) {
    if (f.deleted || f.taskId !== t.id || used.has(f.id)) continue;
    const end = f.start + f.minutes * 60000;
    if (end > last) sum += f.minutes;
  }
  return sum;
}

/** Şu an tik atılabilir mi? Atılamıyorsa nedeni ve ne zaman atılabileceği. */
export function canCheck(t: Task, mine: TaskCheck[], focus: FocusSession[], now: number, opts: { ignoreFocus?: boolean } = {}): CheckBlock {
  const p = taskProgress(t, mine);
  if (p.complete) return { ok: false, reason: 'complete' };
  const today = dayKeyOfTs(now);
  if (t.startDate && today < t.startDate) return { ok: false, reason: 'notStarted', date: t.startDate };
  const r = t.rule ?? {};
  const last = mine[mine.length - 1];
  if (last && r.perDay && last.date >= today) return { ok: false, reason: 'perDay', nextAt: dayStartTs(addDays(last.date, 1)) };
  if (last && r.gapHours && r.gapHours > 0) {
    const nextAt = last.at + r.gapHours * 3600000;
    if (now < nextAt) return { ok: false, reason: 'gap', nextAt };
  }
  if (!opts.ignoreFocus && r.focusMin && r.focusMin > 0) {
    const have = focusSinceLastCheck(t, mine, focus);
    if (have < r.focusMin) return { ok: false, reason: 'focus', need: r.focusMin, have };
  }
  return { ok: true };
}

export type Pace = { state: 'ahead' | 'onTrack' | 'behind'; expected: number; daysLeft: number; perDayNeeded: number };

/** Hedefli görevde plana göre neredeyiz (ör. 1/3 yapıldı, 4 gün kaldı → geride). */
export function taskPace(t: Task, mine: TaskCheck[], today: string): Pace | null {
  if (!isTargeted(t) || !t.dueDate || t.status === 'done') return null;
  const start = t.startDate ?? keyOfTs(t.createdAt);
  if (today < start) return null; // henüz başlamadı
  const total = Math.max(1, diffDays(t.dueDate, start) + 1);
  const elapsed = Math.min(total, Math.max(0, diffDays(today, start) + 1));
  const expected = (t.target! * elapsed) / total;
  const count = mine.length;
  const daysLeft = Math.max(0, diffDays(t.dueDate, today) + 1);
  const remaining = Math.max(0, t.target! - count);
  const perDayNeeded = daysLeft ? remaining / daysLeft : remaining;
  const state = count < Math.floor(expected + 1e-9) ? 'behind' : count > Math.ceil(expected - 1e-9) ? 'ahead' : 'onTrack';
  return { state, expected, daysLeft, perDayNeeded };
}

export type Outcome = 'done' | 'failed' | 'open';
/** Geçmiş görünümü için: bitti / süresi geçti ve yapılamadı / açık. */
export function taskOutcome(t: Task, today: string): Outcome {
  if (t.status === 'done') return 'done';
  if (t.dueDate && t.dueDate < today) return 'failed';
  return 'open';
}

/** Tekrarlayan görevin bir sonraki son tarihi. */
export function nextDue(t: Task): string | null {
  if (!t.repeat || !t.dueDate) return null;
  const n = Math.max(1, t.repeat.every);
  if (t.repeat.unit === 'day') return addDays(t.dueDate, n);
  if (t.repeat.unit === 'week') return addDays(t.dueDate, 7 * n);
  return addMonthsKeepDay(t.dueDate, n);
}

/** Tekrarlayan görev tamamlanınca oluşturulacak bir sonraki görev (kimlik belirleyici: iki cihaz aynısını üretir). */
export function nextOccurrence(t: Task): Omit<Task, 'updatedAt' | 'dirty' | 'deleted'> | null {
  const due = nextDue(t);
  if (!due || !t.dueDate) return null;
  const seriesId = t.seriesId ?? t.id;
  const shift = diffDays(due, t.dueDate);
  return {
    id: `${seriesId}_${due}`,
    title: t.title,
    notes: t.notes,
    projectId: t.projectId,
    startDate: t.startDate ? addDays(t.startDate, shift) : undefined,
    dueDate: due,
    dueTime: t.dueTime,
    duration: t.duration,
    reminderAt: t.reminderAt ? `${due}${t.reminderAt.slice(10)}` : undefined,
    status: 'todo',
    priority: t.priority,
    createdAt: Date.now(),
    target: t.target,
    rule: t.rule,
    repeat: t.repeat,
    seriesId,
    checklist: t.checklist?.map((c) => ({ ...c, done: false })),
    phase: t.phase,
  };
}

// ---------------------------------------------------------------------------
// Hızlı plan: metinden görev listesi
// ---------------------------------------------------------------------------
export interface PlanLine {
  title: string;
  days: number;
  milestone: boolean;
  target?: number;
  phase?: string;
}

/**
 * Her satır bir iş:  "Literatür taraması 10g", "Ara rapor !", "Prototip 3hf x5", "# Aşama".
 * g/gün/d/day = gün, hf/hafta/w/week = hafta, ! = kilometre taşı, x5 = hedefli (5 tik).
 */
export function parsePlan(text: string): PlanLine[] {
  const out: PlanLine[] = [];
  let phase: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    let s = raw.trim().replace(/^[-*•]\s*/, '');
    if (!s) continue;
    if (s.startsWith('#')) {
      phase = s.replace(/^#+/, '').trim() || undefined;
      continue;
    }
    let milestone = false;
    let target: number | undefined;
    let days = 1;
    let found = false;
    // sondan başlayarak belirteçleri ayıkla
    for (;;) {
      let m: RegExpMatchArray | null;
      if ((m = s.match(/\s*!$/))) {
        milestone = true;
        s = s.slice(0, -m[0].length);
      } else if ((m = s.match(/\s+[x×](\d{1,3})$/i))) {
        target = Number(m[1]);
        s = s.slice(0, -m[0].length);
      } else if ((m = s.match(/\s+(\d{1,3})\s*(g|gün|gun|d|day|days)$/i))) {
        days = Number(m[1]);
        found = true;
        s = s.slice(0, -m[0].length);
      } else if ((m = s.match(/\s+(\d{1,2})\s*(hf|hafta|w|wk|week|weeks)$/i))) {
        days = Number(m[1]) * 7;
        found = true;
        s = s.slice(0, -m[0].length);
      } else break;
    }
    const title = s.trim();
    if (!title) continue;
    if (milestone && !found) days = 1;
    out.push({ title, days: Math.max(1, days), milestone, target: target && target >= 2 ? target : undefined, phase });
  }
  return out;
}

export interface Scheduled extends PlanLine {
  start: string;
  end: string;
}

/**
 * Satırları başlangıçtan itibaren sırayla yerleştirir. Kilometre taşı süre tüketmez, sıradaki boş güne düşer.
 * fit=true ise toplam süre, bitiş tarihine sığacak şekilde orantılanır.
 */
export function schedulePlan(lines: PlanLine[], start: string, opts: { end?: string; fit?: boolean } = {}): { items: Scheduled[]; end: string; overflow: number } {
  const total = lines.reduce((s, l) => s + (l.milestone ? 0 : l.days), 0);
  const avail = opts.end ? diffDays(opts.end, start) + 1 : Infinity;
  const scale = opts.fit && opts.end && total > 0 && avail > 0 ? avail / total : 1;
  const items: Scheduled[] = [];
  let cursor = 0; // başlangıçtan itibaren gün (kesirli)
  for (const l of lines) {
    if (l.milestone) {
      const d = Math.max(0, Math.ceil(cursor - 1e-9) - (cursor > 0 ? 1 : 0));
      items.push({ ...l, start: addDays(start, d), end: addDays(start, d) });
      continue;
    }
    const len = l.days * scale;
    const s0 = Math.floor(cursor + 1e-9);
    const e0 = Math.max(s0, Math.ceil(cursor + len - 1e-9) - 1);
    items.push({ ...l, start: addDays(start, s0), end: addDays(start, e0) });
    cursor += len;
  }
  const end = items.reduce((m, x) => (x.end > m ? x.end : m), start);
  const overflow = opts.end ? Math.max(0, diffDays(end, opts.end)) : 0;
  return { items, end, overflow };
}
