// Ortak alışkanlık grubunun özetleri (saf): her üyenin serisi, son günleri, "birlikte seri".
import { addDays, range } from './dates';
import { buildHabitIndex, habitStats, type HabitIndex } from './logic';
import type { GroupOverview, GroupSlot } from './social';
import type { Habit, HabitLog } from './types';

export interface GroupDef {
  group_id: string;
  name: string;
  icon: string;
  color: string;
  slots: GroupSlot[];
  weekly_target: number;
}

/** Grubun kuralına göre sahte bir alışkanlık: seriyi uygulamadaki aynı kodla hesaplamak için. */
export function groupHabit(g: GroupDef, joinedAt: number): Habit {
  return {
    id: g.group_id, name: g.name, icon: g.icon, color: g.color, weeklyTarget: g.weekly_target,
    slots: g.slots.length ? g.slots.map((s) => ({ id: s.id, name: s.name })) : undefined,
    archived: 0, order: 0, createdAt: joinedAt, updatedAt: 0, deleted: 0, dirty: 0,
  };
}

export interface MemberSummary {
  user_id: string;
  name: string;
  me: boolean;
  idx: HabitIndex;
  streak: number;
  unit: 'day' | 'week';
  doneToday: boolean;
  todayCount: number;
  todayTotal: number;
  todayAt?: number;
  weekCount: number;
}

export function summarize(g: GroupDef, ov: GroupOverview, today: string, monday: boolean): { members: MemberSummary[]; together: number } {
  const members = ov.members.map((m) => {
    const h = groupHabit(g, new Date(m.joined_at).getTime());
    const logs: HabitLog[] = ov.checks
      .filter((c) => c.user_id === m.user_id)
      .map((c) => ({
        id: `${c.day}_${c.slot}`, habitId: h.id, date: c.day, slotId: c.slot || undefined, done: 1, at: c.at ? new Date(c.at).getTime() : undefined,
        minutes: 0, updatedAt: 0, deleted: 0, dirty: 0,
      }));
    const idx = buildHabitIndex(h, logs);
    const s = habitStats(h, idx, today, monday);
    const td = idx.get(today);
    const todayAt = td ? (td.at ?? Math.max(0, ...[...td.slots.values()].map((v) => v ?? 0))) || undefined : undefined;
    return { user_id: m.user_id, name: m.name || '—', me: m.me, idx, streak: s.streak, unit: s.unit, doneToday: s.doneToday, todayCount: s.todayCount, todayTotal: s.todayTotal, todayAt, weekCount: s.weekCount };
  });
  // Birlikte seri: herkesin tamamladığı ardışık günler (bugün henüz bitmediyse dünden geriye sayılır)
  let together = 0;
  if (members.length > 1) {
    const all = (k: string) => members.every((m) => m.idx.get(k)?.complete);
    let k = all(today) ? today : addDays(today, -1);
    const earliest = addDays(today, -400);
    while (k >= earliest && all(k)) {
      together++;
      k = addDays(k, -1);
    }
  }
  return { members, together };
}

export const lastDays = (today: string, n: number) => range(addDays(today, -(n - 1)), today);
