// Arkadaşlar, ortak alışkanlıklar ve liderlik tablosu — sunucu (Supabase) çağrıları.
// Gizlilik kuralları sunucuda (supabase/social.sql) uygulanır; burada yalnızca çağrılar var.
import { addDays, todayKey } from './dates';
import { db, getMeta, patch, setMeta } from './db';
import { supa } from './supabase';
import type { Habit } from './types';

export interface Profile {
  user_id: string;
  display_name: string;
  invite_code: string;
  show_in_league: boolean;
  league_asked: boolean;
  tz: string;
  day_start_hour: number;
}
export interface Friend {
  user_id: string;
  display_name: string;
  since: string;
}
export type Board = 'week' | 'month' | 'streak';
export interface BoardRow {
  user_id: string;
  display_name: string;
  points: number;
  longest: number | null;
  is_me: boolean;
  hidden: boolean;
}
export interface GroupSlot {
  id: string;
  name: string;
}
export interface Group {
  group_id: string;
  name: string;
  icon: string;
  color: string;
  slots: GroupSlot[];
  weekly_target: number;
  joined_at: string;
}
export interface Invite extends Omit<Group, 'joined_at'> {
  invited_by_name: string;
  members: number;
}
export interface GroupOverview {
  members: { user_id: string; name: string; joined_at: string; me: boolean }[];
  checks: { user_id: string; day: string; slot: string; at: string | null }[];
  reactions: { from: string; to: string; day: string; emoji: string }[];
  invited: { user_id: string; name: string }[];
}

/** Sunucu hatalarını uygulamadaki anlamlı kodlara çevirir. */
export class SocialError extends Error {
  constructor(public code: 'signedOut' | 'serverOutdated' | 'invalidCode' | 'ownCode' | 'tooMany' | 'offline' | 'other', msg: string) {
    super(msg);
  }
}

function client() {
  const c = supa();
  if (!c) throw new SocialError('signedOut', 'no supabase');
  return c;
}

function mapErr(e: { message?: string; code?: string } | null | undefined): never {
  const m = e?.message ?? String(e);
  if (e?.code === 'PGRST202' || e?.code === '42883' || e?.code === '42P01' || /could not find the function|does not exist/i.test(m)) throw new SocialError('serverOutdated', m);
  if (/invalid code/.test(m)) throw new SocialError('invalidCode', m);
  if (/own code/.test(m)) throw new SocialError('ownCode', m);
  if (/too many attempts/.test(m)) throw new SocialError('tooMany', m);
  if (/not signed in|JWT/i.test(m)) throw new SocialError('signedOut', m);
  if (/failed to fetch|network/i.test(m)) throw new SocialError('offline', m);
  throw new SocialError('other', m);
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) mapErr(error);
  return data as T;
}

export async function currentUserId(): Promise<string | null> {
  const c = supa();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user.id ?? null;
}

const localTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Profili oluştur / saat dilimini güncelle. Ad boşsa mevcut ad korunur. */
export async function ensureProfile(name: string, dayStartHour: number): Promise<Profile> {
  const r = await rpc<Profile | Profile[]>('ensure_profile', { p_name: name, p_tz: localTz(), p_day_start: dayStartHour });
  return Array.isArray(r) ? r[0] : r;
}

export async function updateProfile(p: Partial<Pick<Profile, 'display_name' | 'show_in_league' | 'league_asked'>>) {
  const id = await currentUserId();
  if (!id) throw new SocialError('signedOut', 'signed out');
  const { error } = await client().from('profiles').update(p).eq('user_id', id);
  if (error) mapErr(error);
}

export const regenerateCode = () => rpc<string>('regenerate_invite_code');
export const addFriend = async (code: string) => (await rpc<{ user_id: string; display_name: string }[]>('add_friend', { p_code: code }))[0];
export const myFriends = () => rpc<Friend[]>('my_friends');
export const removeFriend = (id: string) => rpc<void>('remove_friend', { u: id });
export const leaderboard = (period: Board) => rpc<BoardRow[]>('leaderboard', { period });

export const myGroups = async () => (await rpc<Group[]>('my_groups')).map((g) => ({ ...g, slots: g.slots ?? [] }));
export const myInvites = async () => (await rpc<Invite[]>('my_invites')).map((g) => ({ ...g, slots: g.slots ?? [] }));
export const respondInvite = (g: string, accept: boolean) => rpc<void>('respond_invite', { g, accept });
export const inviteToGroup = (g: string, u: string) => rpc<void>('invite_to_group', { g, u });
export const groupOverview = (g: string, since: string) => rpc<GroupOverview>('group_overview', { g, since });
export const react = (g: string, to: string, day: string, emoji: string) => rpc<void>('react', { g, p_to: to, p_day: day, p_emoji: emoji });

/** Bir alışkanlıktan ortak alışkanlık başlatır ve seçilen arkadaşları davet eder. */
export async function createGroupFromHabit(h: Habit, friendIds: string[]): Promise<string> {
  const slots: GroupSlot[] = (h.slots ?? []).map((s) => ({ id: s.id, name: s.name }));
  const g = await rpc<string>('create_group', {
    p_name: h.name,
    p_icon: h.icon,
    p_color: h.color,
    p_slots: slots,
    p_weekly_target: h.days?.length ? h.days.length : h.weeklyTarget,
    p_invite: friendIds,
  });
  await patch<Habit>('habits', h.id, { share: { groupId: g, slotMap: Object.fromEntries(slots.map((s) => [s.id, s.id])) } });
  await publishShared(true);
  return g;
}

/** Daveti kabul edip mevcut bir alışkanlığa bağlar. */
export async function joinWithHabit(inv: Invite, habitId: string, slotMap?: Record<string, string>) {
  await respondInvite(inv.group_id, true);
  await patch<Habit>('habits', habitId, { share: { groupId: inv.group_id, slotMap } });
  await publishShared(true);
}

/** Gruptan ayrıl: sunucudaki paylaşılmış günlerin silinir, alışkanlık sende normal alışkanlık olarak kalır. */
export async function leaveGroup(groupId: string) {
  await rpc<void>('leave_group', { g: groupId });
  const hs = await db.habits.toArray();
  for (const h of hs) if (h.share?.groupId === groupId) await patch<Habit>('habits', h.id, { share: undefined });
  await setMeta('pub:' + groupId, null);
}

// ---------------------------------------------------------------------------
// Ortak alışkanlık tiklerini yayınla (eşitleme sonrası çağrılır; değişiklik yoksa sunucuya gitmez)
// ---------------------------------------------------------------------------
const PUBLISH_DAYS = 60;

export function shareRows(h: Habit, logs: { date: string; slotId?: string; done: 0 | 1; at?: number; deleted: 0 | 1 }[], from: string) {
  const slotted = (h.slots?.length ?? 0) > 0;
  const rows: { day: string; slot: string; at: number | null }[] = [];
  for (const l of logs) {
    if (!l.done || l.deleted || l.date < from) continue;
    if (slotted) {
      if (!l.slotId) continue;
      const gs = h.share?.slotMap?.[l.slotId];
      if (!gs) continue; // grupta karşılığı olmayan bölüm paylaşılmaz
      rows.push({ day: l.date, slot: gs, at: l.at ?? null });
    } else if (!l.slotId) rows.push({ day: l.date, slot: '', at: l.at ?? null });
  }
  return rows.sort((a, b) => (a.day + a.slot).localeCompare(b.day + b.slot));
}

let publishing = false;
export async function publishShared(force = false) {
  if (publishing || !supa()) return;
  publishing = true;
  try {
    if (!(await currentUserId())) return;
    const today = todayKey();
    const from = addDays(today, -PUBLISH_DAYS);
    const habits = (await db.habits.toArray()).filter((h) => h.share?.groupId && !h.deleted);
    for (const h of habits) {
      const logs = await db.habitLogs.where('habitId').equals(h.id).toArray();
      const rows = shareRows(h, logs, from);
      const key = 'pub:' + h.share!.groupId;
      const sig = JSON.stringify([from, today, rows]);
      if (!force && (await getMeta<string | null>(key, null)) === sig) continue;
      try {
        await rpc<void>('publish_checks', { g: h.share!.groupId, p_from: from, p_to: addDays(today, 1), p_rows: rows });
        await setMeta(key, sig);
      } catch (e) {
        // Başka cihazdan ayrılmış olabilir: bağı kaldır
        if (e instanceof SocialError && /not a member/.test(e.message)) await patch<Habit>('habits', h.id, { share: undefined });
        else if (!(e instanceof SocialError && e.code === 'serverOutdated')) console.warn('publish', e);
      }
    }
  } finally {
    publishing = false;
  }
}
