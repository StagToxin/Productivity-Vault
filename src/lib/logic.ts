// Saf hesaplama fonksiyonları: XP, seviye, Duolingo tarzı seri, alışkanlık serileri, rozetler.
// Hepsi kayıtlardan TÜRETİLİR, ayrıca saklanmaz → cihazlar arası çakışma imkânsız.
import { addDays, keyOfTs, range, startOfWeek, weekdayIndex } from './dates';
import type { FocusSession, Habit, HabitLog, HabitSlot, Task, TaskCheck } from './types';

export const XP = {
  habit: 10,
  slot: 5, // bölümlü alışkanlıkta her bölüm
  task: [10, 15, 25] as const, // önceliğe göre
  taskCheck: 5, // hedefli görevde her tik
  focusPer5Min: 2,
};

export interface Activity {
  habitLogs: HabitLog[];
  tasks: Task[];
  focus: FocusSession[];
  checks?: TaskCheck[];
}

/** Gün → kazanılan XP haritası */
export function xpByDay(a: Activity): Map<string, number> {
  const m = new Map<string, number>();
  const add = (k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const l of a.habitLogs) if (l.done && !l.deleted) add(l.date, l.slotId ? XP.slot : XP.habit);
  for (const t of a.tasks) if (t.status === 'done' && t.doneAt && !t.deleted) add(keyOfTs(t.doneAt), XP.task[t.priority] ?? 10);
  for (const f of a.focus) if (!f.deleted) add(f.date, Math.floor(f.minutes / 5) * XP.focusPer5Min);
  for (const c of a.checks ?? []) if (!c.deleted) add(c.date, XP.taskCheck);
  return m;
}

export function totalXp(byDay: Map<string, number>): number {
  let s = 0;
  byDay.forEach((v) => (s += v));
  return s;
}

/** Seviye n'e ulaşmak için toplam XP: 50·n·(n-1) → 0, 100, 300, 600, 1000... */
export function levelInfo(xp: number) {
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  const floor = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, into: xp - floor, need: next - floor, progress: (xp - floor) / (next - floor) };
}

export type DayState = 'done' | 'frozen' | 'missed' | 'pending' | 'none';

export interface StreakResult {
  current: number;
  longest: number;
  freezes: number; // elde kalan dondurma hakkı
  todayDone: boolean;
  days: Map<string, DayState>;
}

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;

/**
 * Duolingo tarzı günlük seri.
 * - Günlük XP hedefine ulaşılan gün "done".
 * - Her 7 ardışık aktif günde 1 dondurma (en fazla 2) kazanılır.
 * - Kaçırılan günde dondurma varsa otomatik harcanır ("frozen"), seri bozulmaz.
 * - Bugün henüz tamamlanmadıysa seri bozulmaz ("pending").
 */
export function computeStreak(byDay: Map<string, number>, goal: number, today: string): StreakResult {
  const days = new Map<string, DayState>();
  const activeKeys = [...byDay.entries()].filter(([, v]) => v >= goal).map(([k]) => k).sort();
  if (activeKeys.length === 0) {
    days.set(today, 'pending');
    return { current: 0, longest: 0, freezes: 0, todayDone: false, days };
  }
  let streak = 0;
  let longest = 0;
  let freezes = 0;
  let sinceFreeze = 0;
  const first = activeKeys[0] < today ? activeKeys[0] : today;
  for (const k of range(first, today)) {
    const active = (byDay.get(k) ?? 0) >= goal;
    if (active) {
      streak++;
      sinceFreeze++;
      if (sinceFreeze >= FREEZE_EVERY) {
        sinceFreeze = 0;
        if (freezes < MAX_FREEZES) freezes++;
      }
      days.set(k, 'done');
    } else if (k === today) {
      days.set(k, 'pending');
    } else if (streak > 0 && freezes > 0) {
      freezes--;
      days.set(k, 'frozen');
    } else {
      if (streak > 0) days.set(k, 'missed');
      streak = 0;
      sinceFreeze = 0;
    }
    longest = Math.max(longest, streak);
  }
  return { current: streak, longest, freezes, todayDone: (byDay.get(today) ?? 0) >= goal, days };
}

// ---------------------------------------------------------------------------
// Alışkanlık günleri
// ---------------------------------------------------------------------------

export interface DayInfo {
  count: number; // onaylanan bölüm sayısı (bölümsüz alışkanlıkta 0/1)
  total: number; // gereken bölüm sayısı
  complete: boolean;
  slots: Map<string, number | undefined>; // slotId → onay anı
  at?: number; // bölümsüz alışkanlığın onay anı
  minutes: number;
}
export type HabitIndex = Map<string, DayInfo>;

/** Bir alışkanlığın tüm günlerini tek geçişte özetler. */
export function buildHabitIndex(h: Habit, logs: HabitLog[]): HabitIndex {
  const ids = new Set((h.slots ?? []).map((s) => s.id));
  const slotted = ids.size > 0;
  const total = slotted ? ids.size : 1;
  const m: HabitIndex = new Map();
  for (const l of logs) {
    if (l.habitId !== h.id || l.deleted) continue;
    let d = m.get(l.date);
    if (!d) {
      d = { count: 0, total, complete: false, slots: new Map(), minutes: 0 };
      m.set(l.date, d);
    }
    d.minutes += l.minutes || 0;
    if (!l.done) continue;
    if (slotted) {
      if (l.slotId && ids.has(l.slotId) && !d.slots.has(l.slotId)) {
        d.slots.set(l.slotId, l.at);
        d.count++;
      }
    } else if (!l.slotId) {
      d.count = 1;
      d.at = l.at;
    }
  }
  for (const d of m.values()) d.complete = d.count >= total;
  return m;
}

export const isSlotted = (h: Habit) => (h.slots?.length ?? 0) > 0;
export const isScheduled = (h: Habit, key: string) => !h.days?.length || h.days.includes(weekdayIndex(key, true));
export const effectiveTarget = (h: Habit) => (h.days?.length ? h.days.length : Math.min(7, Math.max(1, h.weeklyTarget)));
export const habitUnit = (h: Habit): 'day' | 'week' => (h.days?.length || effectiveTarget(h) >= 7 ? 'day' : 'week');

export interface HabitStats {
  doneDates: Set<string>;
  weekCount: number; // bu hafta tamamlanan gün
  weekProgress: number; // 0..1
  streak: number;
  maxStreak: number;
  unit: 'day' | 'week';
  doneToday: boolean;
  todayCount: number;
  todayTotal: number;
  monthCount: number;
  rate30: number; // son 30 günde beklenene oranı
  totalDone: number;
  minutes: number;
}

/**
 * Alışkanlık serisi:
 * - Her gün / belirli günler → ardışık PLANLI günler sayılır (plan dışı günler seriyi bozmaz).
 * - Haftada N gün → hedefin tuttuğu ardışık HAFTA sayılır; içinde bulunulan hafta seriyi bozmaz.
 * - Bölümlü alışkanlıkta gün, tüm bölümler onaylanınca "tamam" sayılır.
 */
export function habitStats(h: Habit, idx: HabitIndex, today: string, monday = true): HabitStats {
  const doneDates = new Set<string>();
  let minutes = 0;
  for (const [k, d] of idx) {
    if (d.complete) doneDates.add(k);
    minutes += d.minutes;
  }
  const target = effectiveTarget(h);
  const unit = habitUnit(h);
  const weekStart = startOfWeek(today, monday);
  const weekDays = range(weekStart, addDays(weekStart, 6));
  const weekCount = weekDays.filter((d) => doneDates.has(d)).length;
  const monthPrefix = today.slice(0, 7);
  const monthCount = [...doneDates].filter((d) => d.startsWith(monthPrefix)).length;
  const createdKey = keyOfTs(h.createdAt);
  const sorted = [...doneDates].sort();
  const first = sorted[0] && sorted[0] < createdKey ? sorted[0] : createdKey;

  let streak = 0;
  let maxStreak = 0;
  if (unit === 'day') {
    let run = 0;
    for (const k of range(first <= today ? first : today, today)) {
      if (!isScheduled(h, k)) continue;
      if (doneDates.has(k)) run++;
      else if (k !== today) run = 0;
      maxStreak = Math.max(maxStreak, run);
    }
    streak = run;
  } else {
    const weekMet = (ws: string) => range(ws, addDays(ws, 6)).filter((d) => doneDates.has(d)).length >= target;
    let ws = startOfWeek(first <= today ? first : today, monday);
    let run = 0;
    while (ws <= weekStart) {
      if (weekMet(ws)) {
        run++;
        maxStreak = Math.max(maxStreak, run);
      } else if (ws !== weekStart) run = 0;
      ws = addDays(ws, 7);
    }
    streak = run;
  }

  // son 30 gün: bölümlü günlerde kısmi ilerleme de sayılır
  const from30 = addDays(today, -29);
  const spanStart = createdKey > from30 ? createdKey : from30;
  let doneAmount = 0;
  for (const [k, d] of idx) if (k >= from30 && k <= today) doneAmount += Math.min(1, d.count / d.total);
  const spanDays = spanStart <= today ? range(spanStart, today) : [today];
  const expected = h.days?.length ? spanDays.filter((k) => isScheduled(h, k)).length : (spanDays.length * target) / 7;
  const rate30 = Math.min(1, doneAmount / Math.max(1, expected));
  const td = idx.get(today);

  return {
    doneDates,
    weekCount,
    weekProgress: Math.min(1, weekCount / target),
    streak,
    maxStreak,
    unit,
    doneToday: !!td?.complete,
    todayCount: td?.count ?? 0,
    todayTotal: td?.total ?? (isSlotted(h) ? h.slots!.length : 1),
    monthCount,
    rate30,
    totalDone: doneDates.size,
    minutes,
  };
}

export interface MissedItem {
  habit: Habit;
  date: string; // haftalıkta haftanın ilk günü
  kind: 'day' | 'slot' | 'week';
  slot?: HabitSlot;
  time?: string; // planlanan saat
  done?: number; // haftalık: yapılan gün
  target?: number;
  partial?: number; // bölümlü günde o gün kaç bölüm yapılmış
}

/**
 * Kaçırılanlar: planlı olup yapılmayan günler / bölümler / haftalar.
 * Bugün: yalnızca saati geçmiş bölümler listelenir.
 */
export function missedFor(h: Habit, idx: HabitIndex, from: string, today: string, nowHm: string, monday = true): MissedItem[] {
  const out: MissedItem[] = [];
  const createdKey = keyOfTs(h.createdAt);
  const start = from > createdKey ? from : createdKey;
  if (start > today) return out;

  if (habitUnit(h) === 'day') {
    for (const k of range(start, today)) {
      if (!isScheduled(h, k)) continue;
      const d = idx.get(k);
      if (isSlotted(h)) {
        for (const slot of h.slots!) {
          if (d?.slots.has(slot.id)) continue;
          if (k === today && !(slot.time && slot.time < nowHm)) continue;
          out.push({ habit: h, date: k, kind: 'slot', slot, time: slot.time, partial: d?.count ?? 0 });
        }
      } else if (k !== today && !d?.complete) {
        out.push({ habit: h, date: k, kind: 'day', time: h.reminderTime });
      }
    }
  } else {
    const target = effectiveTarget(h);
    const thisWeek = startOfWeek(today, monday);
    // oluşturulduğu (yarım) hafta atlanır
    let ws = addDays(startOfWeek(start, monday), start === startOfWeek(start, monday) ? 0 : 7);
    for (; ws < thisWeek; ws = addDays(ws, 7)) {
      const done = range(ws, addDays(ws, 6)).filter((k) => idx.get(k)?.complete).length;
      if (done < target) out.push({ habit: h, date: ws, kind: 'week', done, target });
    }
  }
  return out;
}

export interface Badge {
  id: string;
  icon: string;
  earned: boolean;
  progress: number; // 0..1
}

export function badges(opts: { longestStreak: number; tasksDone: number; focusMinutes: number; habitChecks: number; level: number; freezesUsed: number }): Badge[] {
  const b = (id: string, icon: string, value: number, need: number): Badge => ({ id, icon, earned: value >= need, progress: Math.min(1, value / need) });
  return [
    b('firstStep', '🌱', opts.habitChecks, 1),
    b('streak7', '🔥', opts.longestStreak, 7),
    b('streak30', '🌋', opts.longestStreak, 30),
    b('streak100', '💎', opts.longestStreak, 100),
    b('streak365', '👑', opts.longestStreak, 365),
    b('tasks10', '✅', opts.tasksDone, 10),
    b('tasks100', '🏆', opts.tasksDone, 100),
    b('focus60', '⏱️', opts.focusMinutes, 60),
    b('focus1000', '🧠', opts.focusMinutes, 1000),
    b('habits100', '💪', opts.habitChecks, 100),
    b('level5', '⭐', opts.level, 5),
    b('level10', '🌟', opts.level, 10),
    b('frozen', '🧊', opts.freezesUsed, 1),
  ];
}

export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365, 500, 1000];
