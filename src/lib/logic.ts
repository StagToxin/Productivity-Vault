// Saf hesaplama fonksiyonları: XP, seviye, Duolingo tarzı seri, alışkanlık serileri, rozetler.
// Hepsi kayıtlardan TÜRETİLİR, ayrıca saklanmaz → cihazlar arası çakışma imkânsız.
import { addDays, diffDays, range, startOfWeek } from './dates';
import type { FocusSession, Habit, HabitLog, Task } from './types';

export const XP = {
  habit: 10,
  task: [10, 15, 25] as const, // önceliğe göre
  focusPer5Min: 2,
};

export interface Activity {
  habitLogs: HabitLog[];
  tasks: Task[];
  focus: FocusSession[];
}

const keyOfTs = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Gün → kazanılan XP haritası */
export function xpByDay(a: Activity): Map<string, number> {
  const m = new Map<string, number>();
  const add = (k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const l of a.habitLogs) if (l.done && !l.deleted) add(l.date, XP.habit);
  for (const t of a.tasks) if (t.status === 'done' && t.doneAt && !t.deleted) add(keyOfTs(t.doneAt), XP.task[t.priority] ?? 10);
  for (const f of a.focus) if (!f.deleted) add(f.date, Math.floor(f.minutes / 5) * XP.focusPer5Min);
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

export interface HabitStats {
  doneDates: Set<string>;
  weekCount: number; // bu hafta tamamlanan gün
  weekProgress: number; // 0..1
  streak: number;
  maxStreak: number;
  unit: 'day' | 'week';
  doneToday: boolean;
  monthCount: number;
  rate30: number; // son 30 günde beklenen tamamlanmaya oranı
  totalDone: number;
  minutes: number;
}

/**
 * Alışkanlık serisi:
 * - Haftada 7 hedefliler → ardışık GÜN sayılır.
 * - Diğerleri (örn. haftada 3) → hedefin tuttuğu ardışık HAFTA sayılır. İçinde bulunulan hafta
 *   henüz hedefi tutmadıysa seriyi bozmaz.
 */
export function habitStats(h: Habit, logs: HabitLog[], today: string, monday = true): HabitStats {
  const doneDates = new Set(logs.filter((l) => l.habitId === h.id && l.done && !l.deleted).map((l) => l.date));
  const minutes = logs.filter((l) => l.habitId === h.id && !l.deleted).reduce((s, l) => s + (l.minutes || 0), 0);
  const weekStart = startOfWeek(today, monday);
  const weekDays = range(weekStart, addDays(weekStart, 6));
  const weekCount = weekDays.filter((d) => doneDates.has(d)).length;
  const target = Math.min(7, Math.max(1, h.weeklyTarget));
  const monthPrefix = today.slice(0, 7);
  const monthCount = [...doneDates].filter((d) => d.startsWith(monthPrefix)).length;

  let streak = 0;
  let maxStreak = 0;
  const sorted = [...doneDates].sort();
  const unit: 'day' | 'week' = target >= 7 ? 'day' : 'week';

  if (unit === 'day') {
    // en uzun
    let run = 0;
    let prev = '';
    for (const d of sorted) {
      run = prev && diffDays(d, prev) === 1 ? run + 1 : 1;
      maxStreak = Math.max(maxStreak, run);
      prev = d;
    }
    // güncel: bugünden (veya bugün yapılmadıysa dünden) geriye
    let k = doneDates.has(today) ? today : addDays(today, -1);
    while (doneDates.has(k)) {
      streak++;
      k = addDays(k, -1);
    }
  } else {
    const weekMet = (ws: string) => range(ws, addDays(ws, 6)).filter((d) => doneDates.has(d)).length >= target;
    if (sorted.length) {
      let ws = startOfWeek(sorted[0], monday);
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
  }

  // son 30 gün oranı: beklenen = 30 * hedef/7
  const from = addDays(today, -29);
  const last30 = [...doneDates].filter((d) => d >= from && d <= today).length;
  const createdKey = keyOfTs(h.createdAt);
  const span = Math.min(30, Math.max(1, diffDays(today, createdKey) + 1));
  const expected = (span * target) / 7;
  const rate30 = Math.min(1, last30 / Math.max(1, expected));

  return {
    doneDates,
    weekCount,
    weekProgress: Math.min(1, weekCount / target),
    streak,
    maxStreak,
    unit,
    doneToday: doneDates.has(today),
    monthCount,
    rate30,
    totalDone: doneDates.size,
    minutes,
  };
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
