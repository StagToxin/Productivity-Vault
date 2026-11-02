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
const { saveTask, toggleHabit, saveHabit, checkTask } = await import('./actions');

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

  it('target-task checks from two offline devices merge instead of overwriting', async () => {
    const id = await saveTask({ title: 'Vize', dueDate: '2099-01-01', target: 3 });
    await syncNow();
    await checkTask(id); // bu cihaz
    // diğer cihazın tiki sunucuda
    server.set('taskChecks:other', { tbl: 'taskChecks', id: 'other', data: { id: 'other', taskId: id, at: Date.now() - 1000, date: '2026-11-01' }, updated_at: Date.now(), deleted: false, server_ts: ts() });
    await syncNow();
    const mine = (await db.taskChecks.where('taskId').equals(id).toArray()).filter((c) => !c.deleted);
    expect(mine.length).toBe(2);
    expect([...server.keys()].filter((k) => k.startsWith('taskChecks:')).length).toBe(2);
  });

  it('after updating from an older version, pulls once from the start (older app skipped new tables)', async () => {
    // eski sürüm: imleç ilerlemiş ama taskChecks kaydını uygulamamış
    server.set('taskChecks:old', { tbl: 'taskChecks', id: 'old', data: { id: 'old', taskId: 't', at: 1, date: '2026-11-01' }, updated_at: 5, deleted: false, server_ts: ts() });
    await db.meta.put({ key: 'syncUser', value: 'u1' });
    await db.meta.put({ key: 'pullCursor', value: '2030-01-01T00:00:00Z' });
    await db.meta.put({ key: 'syncSchema', value: 1 });
    await syncNow();
    expect(await db.taskChecks.get('old')).toBeTruthy();
  });
});
