import { describe, expect, it } from 'vitest';
import { buildPlan, defaultPlan, planTotals } from './plan';

const P = (o: Partial<ReturnType<typeof defaultPlan>>) => ({ ...defaultPlan(), ...o });
const show = (segs: ReturnType<typeof buildPlan>) => segs.map((s) => (s.kind === 'focus' ? s.min : s.kind[0] + s.min)).join(' ');

describe('odak planı', () => {
  it('3 saat net, 45 dk ders, 10 kısa, 3 derste bir 25 uzun', () => {
    const segs = buildPlan(P({ totalMin: 180, blockMin: 45, shortBreak: 10, longBreak: 25, longEvery: 3 }));
    expect(show(segs)).toBe('45 s10 45 s10 45 l25 45');
    expect(planTotals(segs).focus).toBe(180);
  });
  it('tam bölünmeyince eşitler: 2 saat / 45 → 3×40', () => {
    expect(show(buildPlan(P({ totalMin: 120, blockMin: 45, shortBreak: 5 })))).toBe('40 s5 40 s5 40');
  });
  it('eşitleme kapalı: 45+45+30', () => {
    expect(show(buildPlan(P({ totalMin: 120, blockMin: 45, shortBreak: 5, equalize: false })))).toBe('45 s5 45 s5 30');
  });
  it('molasız tek parça', () => {
    expect(show(buildPlan(P({ totalMin: 180, noBreaks: true })))).toBe('180');
  });
  it('kısa mola 0 → sadece uzun mola', () => {
    expect(show(buildPlan(P({ totalMin: 240, blockMin: 40, shortBreak: 0, longBreak: 20, longEvery: 3 })))).toBe('40 40 40 l20 40 40 40');
  });
  it('molalar dahil 3 saat: toplam tam 180 dk', () => {
    const segs = buildPlan(P({ totalMin: 180, countBreaks: true, blockMin: 45, shortBreak: 10, longBreak: 25, longEvery: 3 }));
    expect(planTotals(segs).all).toBe(180);
    for (const s of segs.filter((x) => x.kind === 'focus')) expect(s.min).toBeGreaterThanOrEqual(20);
  });
  it('dersler 20–60 dk aralığında kalır', () => {
    for (const total of [25, 50, 70, 95, 130, 200, 333]) {
      for (const s of buildPlan(P({ totalMin: total, blockMin: 60 })).filter((x) => x.kind === 'focus')) {
        expect(s.min).toBeLessThanOrEqual(60);
        if (total >= 20) expect(s.min).toBeGreaterThanOrEqual(20);
      }
    }
  });
});
