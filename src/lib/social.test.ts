import { describe, expect, it } from 'vitest';
import { summarize } from './groupStats';
import { shareRows } from './social';
import type { Habit } from './types';

const H = (o: Partial<Habit> = {}): Habit => ({ id: 'h', name: 'Kitap', icon: '📖', color: '#000', weeklyTarget: 7, archived: 0, order: 0, createdAt: 0, updatedAt: 0, deleted: 0, dirty: 0, ...o });
const L = (date: string, done: 0 | 1, slotId?: string, deleted: 0 | 1 = 0) => ({ date, done, slotId, at: 1, deleted });

describe('ortak alışkanlık paylaşımı', () => {
  it('sadece yapılan günler ve başlangıçtan sonrası gönderilir', () => {
    const rows = shareRows(H({ share: { groupId: 'g' } }), [L('2026-11-01', 1), L('2026-11-02', 0), L('2026-10-01', 1), L('2026-11-03', 1, undefined, 1)], '2026-10-15');
    expect(rows).toEqual([{ day: '2026-11-01', slot: '', at: 1 }]);
  });
  it('bölümlü: yalnızca grupla eşleşen bölümler, grup bölüm kimliğiyle', () => {
    const h = H({ slots: [{ id: 'a', name: 'Sabah' }, { id: 'b', name: 'Öğle' }], share: { groupId: 'g', slotMap: { a: 'G1' } } });
    const rows = shareRows(h, [L('2026-11-01', 1, 'a'), L('2026-11-01', 1, 'b')], '2026-10-01');
    expect(rows).toEqual([{ day: '2026-11-01', slot: 'G1', at: 1 }]);
  });
});

describe('grup özeti', () => {
  const g = { group_id: 'g', name: 'Kitap', icon: '📖', color: '#000', slots: [], weekly_target: 7 };
  const ov = {
    members: [
      { user_id: 'a', name: 'Ayşe', joined_at: '2026-10-25T08:00:00Z', me: true },
      { user_id: 'b', name: 'Berk', joined_at: '2026-10-25T08:00:00Z', me: false },
    ],
    checks: [
      ...['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map((day) => ({ user_id: 'a', day, slot: '', at: day + 'T07:00:00Z' })),
      ...['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'].map((day) => ({ user_id: 'b', day, slot: '', at: day + 'T09:30:00Z' })),
    ],
    reactions: [],
    invited: [],
  };
  it('her üyenin serisi ve birlikte seri', () => {
    const s = summarize(g, ov, '2026-11-03', true);
    expect(s.members.find((m) => m.user_id === 'a')!.streak).toBe(4); // bugün henüz yapmadı, seri bozulmaz
    expect(s.members.find((m) => m.user_id === 'b')!.streak).toBe(4);
    expect(s.members.find((m) => m.user_id === 'b')!.doneToday).toBe(true);
    expect(s.together).toBe(3); // 31 Eki – 2 Kas ikisi de yaptı
  });
});
