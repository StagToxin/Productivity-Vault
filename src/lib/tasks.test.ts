import { describe, expect, it } from 'vitest';
import { canCheck, focusSinceLastCheck, nextOccurrence, onDay, parsePlan, schedulePlan, taskOutcome, taskPace, taskProgress } from './tasks';
import type { FocusSession, Task, TaskCheck } from './types';

const base: Task = { id: 't1', title: 'Vize çalışması', notes: '', status: 'todo', priority: 1, createdAt: new Date(2026, 10, 1, 9).getTime(), updatedAt: 0, deleted: 0, dirty: 0, dueDate: '2026-11-09', target: 3 };
const chk = (at: Date, extra: Partial<TaskCheck> = {}): TaskCheck => ({ id: 'c' + at.getTime(), taskId: 't1', at: at.getTime(), date: at.toISOString().slice(0, 10), updatedAt: 0, deleted: 0, dirty: 0, ...extra });
const ts = (d: number, h = 12, m = 0) => new Date(2026, 10, d, h, m);

describe('hedefli görev', () => {
  it('ilerleme yüzdesi ve tamamlanma', () => {
    expect(taskProgress(base, [chk(ts(2))]).pct).toBeCloseTo(1 / 3);
    expect(taskProgress(base, [chk(ts(2)), chk(ts(3)), chk(ts(4))]).complete).toBe(true);
  });
  it('şartsız: art arda tik atılabilir, tamamlanınca atılamaz', () => {
    expect(canCheck(base, [chk(ts(2))], [], ts(2, 12, 1).getTime()).ok).toBe(true);
    expect(canCheck(base, [chk(ts(2)), chk(ts(3)), chk(ts(4))], [], ts(5).getTime())).toMatchObject({ ok: false, reason: 'complete' });
  });
  it('X saatte bir: son tikten itibaren sayar', () => {
    const t = { ...base, rule: { gapHours: 6 } };
    const r = canCheck(t, [chk(ts(2, 10))], [], ts(2, 15).getTime());
    expect(r).toMatchObject({ ok: false, reason: 'gap', nextAt: ts(2, 16).getTime() });
    expect(canCheck(t, [chk(ts(2, 10))], [], ts(2, 16).getTime()).ok).toBe(true);
  });
  it('günde 1: takvim gününe göre — gece 23:00 tikinden sonra ertesi gün 00:30 olur', () => {
    const t = { ...base, rule: { perDay: true } };
    const c = chk(ts(2, 23), { date: '2026-11-02' });
    expect(canCheck(t, [c], [], ts(2, 23, 30).getTime())).toMatchObject({ ok: false, reason: 'perDay' });
    expect(canCheck(t, [c], [], ts(3, 0, 30).getTime()).ok).toBe(true);
  });
  it('pomodoro şartı: göreve bağlı odak dakikası yetmeli', () => {
    const t = { ...base, rule: { focusMin: 45 } };
    const f = (id: string, start: Date, minutes: number, taskId = 't1'): FocusSession => ({ id, start: start.getTime(), minutes, taskId, date: '2026-11-02', updatedAt: 0, deleted: 0, dirty: 0 });
    expect(canCheck(t, [], [f('a', ts(2, 10), 25)], ts(2, 11).getTime())).toMatchObject({ ok: false, reason: 'focus', need: 45, have: 25 });
    expect(canCheck(t, [], [f('a', ts(2, 10), 25), f('b', ts(2, 11), 25)], ts(2, 12).getTime()).ok).toBe(true);
    // başka göreve bağlı odak sayılmaz; kullanılmış odak tekrar sayılmaz
    expect(focusSinceLastCheck(t, [chk(ts(2, 12), { focusId: 'b' })], [f('a', ts(2, 10), 25), f('b', ts(2, 11), 25), f('c', ts(2, 13), 30, 'x')])).toBe(0);
  });
  it('başlangıç tarihinden önce tik atılamaz', () => {
    expect(canCheck({ ...base, startDate: '2026-11-05' }, [], [], ts(3).getTime())).toMatchObject({ ok: false, reason: 'notStarted' });
  });
  it('tempo: 9 günde 3 tik', () => {
    const t = { ...base, startDate: '2026-11-01' };
    expect(taskPace(t, [], '2026-11-02')!.state).toBe('onTrack');
    expect(taskPace(t, [chk(ts(2))], '2026-11-06')!.state).toBe('behind');
    expect(taskPace(t, [chk(ts(1)), chk(ts(2))], '2026-11-02')!.state).toBe('ahead');
    expect(taskPace(t, [chk(ts(1))], '2026-11-08')!.daysLeft).toBe(2);
  });
  it('sonuç: süresi geçen ve bitmeyen görev başarısız', () => {
    expect(taskOutcome(base, '2026-11-10')).toBe('failed');
    expect(taskOutcome({ ...base, status: 'done' }, '2026-11-10')).toBe('done');
    expect(taskOutcome(base, '2026-11-09')).toBe('open');
  });
  it('çok günlü görev aralığın her gününde görünür', () => {
    const t = { ...base, startDate: '2026-11-05' };
    expect(onDay(t, '2026-11-05')).toBe(true);
    expect(onDay(t, '2026-11-07')).toBe(true);
    expect(onDay(t, '2026-11-04')).toBe(false);
  });
});

describe('tekrarlayan görev', () => {
  it('bir sonraki görev aynı kimlikle üretilir (iki cihaz aynısını üretir)', () => {
    const t: Task = { ...base, target: undefined, repeat: { every: 1, unit: 'week' }, dueDate: '2026-11-02', checklist: [{ id: 'a', text: 'x', done: true }] };
    const n = nextOccurrence(t)!;
    expect(n.dueDate).toBe('2026-11-09');
    expect(n.id).toBe('t1_2026-11-09');
    expect(n.checklist![0].done).toBe(false);
    expect(nextOccurrence({ ...t, seriesId: 't1', id: 't1_2026-11-09', dueDate: '2026-11-09' })!.id).toBe('t1_2026-11-16');
  });
  it('aylık tekrar ay sonunu korur', () => {
    expect(nextOccurrence({ ...base, repeat: { every: 1, unit: 'month' }, dueDate: '2026-01-31' })!.dueDate).toBe('2026-02-28');
  });
});

describe('hızlı plan', () => {
  const text = `# Araştırma
Literatür taraması 10g
Ara rapor !
# Geliştirme
- Prototip 3hf x5
Test 15 gün`;
  it('metni ayrıştırır', () => {
    const p = parsePlan(text);
    expect(p).toEqual([
      { title: 'Literatür taraması', days: 10, milestone: false, target: undefined, phase: 'Araştırma' },
      { title: 'Ara rapor', days: 1, milestone: true, target: undefined, phase: 'Araştırma' },
      { title: 'Prototip', days: 21, milestone: false, target: 5, phase: 'Geliştirme' },
      { title: 'Test', days: 15, milestone: false, target: undefined, phase: 'Geliştirme' },
    ]);
  });
  it('sırayla yerleştirir; kilometre taşı önceki işin son gününe düşer', () => {
    const { items, end } = schedulePlan(parsePlan(text), '2026-11-01');
    expect(items.map((i) => [i.start, i.end])).toEqual([
      ['2026-11-01', '2026-11-10'],
      ['2026-11-10', '2026-11-10'],
      ['2026-11-11', '2026-12-01'],
      ['2026-12-02', '2026-12-16'],
    ]);
    expect(end).toBe('2026-12-16');
  });
  it('bitişi aşarsa uyarır, orantılı sığdırınca sığar', () => {
    const lines = parsePlan(text);
    expect(schedulePlan(lines, '2026-11-01', { end: '2026-11-30' }).overflow).toBe(16);
    const fit = schedulePlan(lines, '2026-11-01', { end: '2026-11-30', fit: true });
    expect(fit.overflow).toBe(0);
    expect(fit.end).toBe('2026-11-30');
  });
});
