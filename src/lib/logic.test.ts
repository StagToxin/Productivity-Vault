import { describe, expect, it } from 'vitest';
import { addDays, isoWeek, startOfWeek } from './dates';
import { computeStreak, habitStats, levelInfo } from './logic';
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
    const s = habitStats(habit(7), [log(addDays(T, -1)), log(addDays(T, -2))], T);
    expect(s.streak).toBe(2);
    expect(s.unit).toBe('day');
  });
  it('weekly habit counts weeks met', () => {
    // hedef 2/hafta; önceki iki hafta tuttu, bu hafta 1 (henüz sürüyor)
    const logs = ['2026-10-12', '2026-10-13', '2026-10-19', '2026-10-21', '2026-10-27'].map(log);
    const s = habitStats(habit(2), logs, T);
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
