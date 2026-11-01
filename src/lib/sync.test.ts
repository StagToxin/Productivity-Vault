// Eşitleme motorunun uçtan uca testi: sahte bir Supabase sunucusu (LWW kuralı SQL ile aynı) kullanılır.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { tbl: string; id: string; data: Record<string, unknown>; updated_at: number; deleted: boolean; server_ts: string };
const server = new Map<string, Row>();
let clock = 0;
const ts = () => new Date(Date.UTC(2026, 0, 1) + ++clock).toISOString();

const fakeClient = {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.c' } } } }),
    onAuthStateChange: () => {},
  },
  rpc: async (_fn: string, { rows }: { rows: Omit<Row, 'server_ts'>[] }) => {
    for (const r of rows) {
      const k = r.tbl + ':' + r.id;
      const cur = server.get(k);
      if (!cur || cur.updated_at < r.updated_at) server.set(k, { ...r, server_ts: ts() });
    }
    return { error: null };
  },
  from: () => {
    let gt = '';
    const q = {
      select: () => q,
      gt: (_c: string, v: string) => ((gt = v), q),
      order: () => q,
      limit: async (n: number) => ({
        data: [...server.values()].filter((r) => r.server_ts > gt).sort((a, b) => a.server_ts.localeCompare(b.server_ts)).slice(0, n),
        error: null,
      }),
    };
    return q;
  },
};
vi.mock('./supabase', () => ({ supa: () => fakeClient, getSupaConfig: () => ({ url: 'x', anonKey: 'y' }) }));

const { db, put, patch } = await import('./db');
const { syncNow, wipeLocal } = await import('./sync');
const { saveTask, toggleHabit, saveHabit } = await import('./actions');

beforeEach(async () => {
  server.clear();
  await wipeLocal();
});

describe('sync end-to-end', () => {
  it('pushes local data and restores it on a fresh device', async () => {
    const id = await saveTask({ title: 'Offline görev' });
    const h = await saveHabit({ name: 'Okuma' });
    await toggleHabit(h, '2026-11-01');
    await syncNow();
    expect(server.size).toBe(3);
    expect((await db.tasks.get(id))!.dirty).toBe(0);

    // "yeni cihaz": yerel boş, sadece aynı kullanıcı
    await db.transaction('rw', [db.tasks, db.habits, db.habitLogs, db.meta], async () => {
      await db.tasks.clear();
      await db.habits.clear();
      await db.habitLogs.clear();
      await db.meta.put({ key: 'syncUser', value: 'u1' });
    });
    await syncNow();
    expect((await db.tasks.get(id))?.title).toBe('Offline görev');
    expect((await db.habitLogs.get(`${h}_2026-11-01`))?.done).toBe(1);
  });

  it('newer remote wins over older local, newer local wins over older remote', async () => {
    const id = await saveTask({ title: 'v1' });
    await syncNow();
    // başka cihaz daha yeni bir sürüm yazmış
    const k = 'tasks:' + id;
    const r = server.get(k)!;
    server.set(k, { ...r, data: { ...r.data, title: 'uzak-v2' }, updated_at: r.updated_at + 1000, server_ts: ts() });
    await syncNow();
    expect((await db.tasks.get(id))!.title).toBe('uzak-v2');

    // şimdi yerelde daha yeni değişiklik (offline yapılmış)
    await patch<import('./types').Task>('tasks', id, { title: 'yerel-v3' });
    await syncNow();
    expect((server.get(k)!.data as { title: string }).title).toBe('yerel-v3');
  });

  it('deletes propagate as tombstones', async () => {
    const id = await saveTask({ title: 'silinecek' });
    await syncNow();
    await put('tasks', { ...(await db.tasks.get(id))!, deleted: 1 });
    await syncNow();
    expect(server.get('tasks:' + id)!.deleted).toBe(true);
  });

  it('wipes local data when a different account signs in', async () => {
    await db.meta.put({ key: 'syncUser', value: 'baska-hesap' });
    await saveTask({ title: 'başkasının görevi' });
    await syncNow();
    expect(server.size).toBe(0);
    expect(await db.tasks.count()).toBe(0);
  });
});
