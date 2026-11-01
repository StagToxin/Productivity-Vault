import { describe, expect, it } from 'vitest';
import { addDays, isoWeek, startOfWeek } from './dates';
import { buildHabitIndex, computeStreak, habitStats, levelInfo, missedFor, xpByDay } from './logic';
import { shouldApply } from './sync';
import type { Habit, HabitLog } from './types';

const T = '2026-11-01'; // Pazar

function days(from: string, n: number, xp = 10) {
  const m = new Map<string, number>();
  for (let i = 0; i < n; i++) m.set(addDays(from, i), xp);
  return m;
}

describe('dates', () => {
  it('week start monday', () => expect(startOfWeek(T)).toBe('2026-10-26'));
  it('iso week', () => expect(isoWeek('2026-02-23')).toBe(9));
});

describe('streak', () => {
  it('counts consecutive days including today', () => {
    const r = computeStreak(days(addDays(T, -4), 5), 10, T);
    expect(r.current).toBe(5);
    expect(r.todayDone).toBe(true);
  });
  it('today pending does not break', () => {
    const r = computeStreak(days(addDays(T, -3), 3), 10, T);
    expect(r.current).toBe(3);
    expect(r.days.get(T)).toBe('pending');
  });
  it('missed day resets without freeze', () => {
    const m = days(addDays(T, -5), 2);
    m.set(T, 10);
    const r = computeStreak(m, 10, T);
    expect(r.current).toBe(1);
    expect(r.longest).toBe(2);
  });
  it('freeze earned after 7 days saves a missed day', () => {
    const start = addDays(T, -9);
    const m = days(start, 7); // 7 gün → 1 dondurma
    // 8. gün kaçırıldı, 9. ve 10. (bugün) yapıldı
    m.set(addDays(T, -1), 10);
    m.set(T, 10);
    const r = computeStreak(m, 10, T);
    expect(r.days.get(addDays(start, 7))).toBe('frozen');
    expect(r.current).toBe(9);
    expect(r.freezes).toBe(0);
  });
  it('goal not reached is not active', () => {
    const r = computeStreak(days(T, 1, 5), 10, T);
    expect(r.current).toBe(0);
  });
});

describe('levels', () => {
  it('thresholds', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(300).level).toBe(3);
  });
});

const habit = (target: number): Habit => ({
  id: 'h', name: 'x', icon: '', color: '', weeklyTarget: target, archived: 0, order: 0,
  createdAt: new Date(2026, 8, 1).getTime(), updatedAt: 0, deleted: 0, dirty: 0,
});
const log = (date: string): HabitLog => ({ id: 'h_' + date, habitId: 'h', date, done: 1, minutes: 0, updatedAt: 0, deleted: 0, dirty: 0 });

describe('habit streaks', () => {
  it('daily habit counts days, today optional', () => {
    const h = habit(7);
    const s = habitStats(h, buildHabitIndex(h, [log(addDays(T, -1)), log(addDays(T, -2))]), T);
    expect(s.streak).toBe(2);
    expect(s.unit).toBe('day');
  });
  it('weekly habit counts weeks met', () => {
    // hedef 2/hafta; önceki iki hafta tuttu, bu hafta 1 (henüz sürüyor)
    const logs = ['2026-10-12', '2026-10-13', '2026-10-19', '2026-10-21', '2026-10-27'].map(log);
    const h = habit(2);
    const s = habitStats(h, buildHabitIndex(h, logs), T);
    expect(s.unit).toBe('week');
    expect(s.streak).toBe(2);
    expect(s.weekCount).toBe(1);
  });
});

describe('sync merge', () => {
  const local = { id: 'a', updatedAt: 100, deleted: 0 as const, dirty: 1 as const };
  it('newer remote applies', () => expect(shouldApply(local, { updated_at: 200 })).toBe('apply'));
  it('older remote skipped', () => expect(shouldApply(local, { updated_at: 50 })).toBe('skip'));
  it('echo acknowledged', () => expect(shouldApply(local, { updated_at: 100 })).toBe('ack'));
  it('missing local applies', () => expect(shouldApply(undefined, { updated_at: 1 })).toBe('apply'));
});

const slotLog = (date: string, slotId: string, at?: number): HabitLog => ({
  id: `h_${date}_${slotId}`, habitId: 'h', date, slotId, done: 1, at, minutes: 0, updatedAt: 0, deleted: 0, dirty: 0,
});
const prayer = (): Habit => ({
  ...habit(7),
  slots: [
    { id: 's', name: 'Sabah', time: '05:30' },
    { id: 'o', name: 'Öğle', time: '13:00' },
    { id: 'a', name: 'Akşam', time: '18:00' },
  ],
});

describe('slotted habits', () => {
  it('day completes only when all slots are done', () => {
    const h = prayer();
    const idx = buildHabitIndex(h, [slotLog(T, 's'), slotLog(T, 'o')]);
    expect(idx.get(T)!.count).toBe(2);
    expect(idx.get(T)!.complete).toBe(false);
    const idx2 = buildHabitIndex(h, [slotLog(T, 's'), slotLog(T, 'o'), slotLog(T, 'a')]);
    expect(habitStats(h, idx2, T).doneToday).toBe(true);
  });
  it('ignores logs of removed slots', () => {
    const h = prayer();
    const idx = buildHabitIndex(h, [slotLog(T, 'eski')]);
    expect(idx.get(T)!.count).toBe(0);
  });
  it('lists missed slots with planned time, today only after time passed', () => {
    const h = prayer();
    const y = addDays(T, -1);
    const idx = buildHabitIndex(h, [slotLog(y, 's'), slotLog(T, 's')]);
    const m = missedFor(h, idx, y, T, '14:00');
    // dün: öğle + akşam; bugün: öğle (saati geçti), akşam henüz değil
    expect(m.map((x) => `${x.date}:${x.slot!.id}`)).toEqual([`${y}:o`, `${y}:a`, `${T}:o`]);
    expect(m[0].time).toBe('13:00');
  });
  it('slot XP counts per slot', () => {
    const xp = xpByDay({ habitLogs: [slotLog(T, 's'), slotLog(T, 'o')], tasks: [], focus: [] });
    expect(xp.get(T)).toBe(10);
  });
});

describe('scheduled weekdays', () => {
  it('unscheduled days do not break the streak', () => {
    // Pzt/Çar/Cum alışkanlığı; T Pazar. 26 Eki Pzt, 28 Çar, 30 Cum yapıldı → seri 3
    const h: Habit = { ...habit(3), days: [0, 2, 4] };
    const idx = buildHabitIndex(h, ['2026-10-26', '2026-10-28', '2026-10-30'].map(log));
    const s = habitStats(h, idx, T);
    expect(s.unit).toBe('day');
    expect(s.streak).toBe(3);
  });
  it('missed lists only scheduled days', () => {
    const h: Habit = { ...habit(3), days: [0, 2, 4] };
    const idx = buildHabitIndex(h, ['2026-10-26', '2026-10-30'].map(log));
    const m = missedFor(h, idx, '2026-10-26', T, '12:00');
    expect(m.map((x) => x.date)).toEqual(['2026-10-28']);
  });
});

describe('weekly missed', () => {
  it('reports past weeks below target', () => {
    const h = habit(2); // 1 Eylül'de oluşturuldu
    const idx = buildHabitIndex(h, ['2026-10-19', '2026-10-20', '2026-10-12'].map(log));
    const m = missedFor(h, idx, '2026-10-12', T, '12:00');
    // 12-18 Eki: 1/2 → kaçırıldı; 19-25: 2/2 → tamam; 26 Eki haftası bu hafta
    expect(m.map((x) => [x.date, x.done])).toEqual([['2026-10-12', 1]]);
  });
});

describe('dashboard layout', async () => {
  const { normalizeWidgets, reorderSubset, DEFAULT_WIDGETS } = await import('./actions');
  it('repairs corrupted widget lists (undefined entries, duplicates)', () => {
    const bad = [undefined, { id: 'tasks', hidden: false, collapsed: false }, null, { id: 'tasks', hidden: true, collapsed: false }] as never;
    const out = normalizeWidgets(bad);
    expect(out.length).toBe(DEFAULT_WIDGETS.length);
    expect(out.every((w) => w && w.id)).toBe(true);
    expect(out[0].id).toBe('tasks');
  });
  it('reorders only the dragged column and never produces holes', () => {
    const all = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    // b, d, e sütunu: e'yi en üste taşı
    const out = reorderSubset(all, ['b', 'd', 'e'], ['e', 'b', 'd']);
    expect(out.map((w) => w.id)).toEqual(['a', 'e', 'c', 'b', 'd']);
  });
});
