// Offline-first eşitleme motoru.
// 1) Her yerel yazım kaydı dirty=1 yapar.
// 2) push: dirty kayıtlar push_records RPC'sine gider; sunucu yalnızca daha YENİ updatedAt'i kabul eder.
// 3) pull: server_ts > imleç olan kayıtlar çekilir; yereldekinden yeniyse yazılır.
// Sonuç: cihazlar offline'ken istediği kadar çalışır, internet gelince "son yazan kazanır" ile birleşir.
import { useSyncExternalStore } from 'react';
import { db, getMeta, observe, onLocalWrite, setMeta, table } from './db';
import { supa } from './supabase';
import { SYNC_TABLES, type SyncFields, type TableName } from './types';

export type SyncState = 'disabled' | 'signedOut' | 'offline' | 'idle' | 'syncing' | 'error';

interface Status {
  state: SyncState;
  lastSync: number | null;
  error: string | null;
  email: string | null;
}

let status: Status = { state: 'disabled', lastSync: null, error: null, email: null };
const subs = new Set<() => void>();
function setStatus(p: Partial<Status>) {
  status = { ...status, ...p };
  subs.forEach((f) => f());
}
export function useSyncStatus(): Status {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => status,
  );
}

export interface RemoteRow {
  tbl: TableName;
  id: string;
  data: Record<string, unknown>;
  updated_at: number;
  deleted: boolean;
  server_ts: string;
}

function toRemote(tbl: TableName, row: SyncFields & Record<string, unknown>) {
  const { dirty: _d, ...data } = row;
  return { tbl, id: row.id, data, updated_at: row.updatedAt, deleted: row.deleted === 1 };
}

/** Uzak kaydı yerele uygular. Test edilebilir olması için ayrı. */
export function shouldApply(local: SyncFields | undefined, remote: Pick<RemoteRow, 'updated_at'>): 'apply' | 'ack' | 'skip' {
  if (!local) return 'apply';
  if (remote.updated_at > local.updatedAt) return 'apply';
  if (remote.updated_at === local.updatedAt) return 'ack'; // kendi yazımımızın yankısı
  return 'skip'; // yereldeki daha yeni; bir sonraki push'ta gönderilecek
}

async function applyRemote(rows: RemoteRow[]) {
  const byTable = new Map<TableName, RemoteRow[]>();
  for (const r of rows) {
    if (!SYNC_TABLES.includes(r.tbl)) continue; // gelecekteki tablolar: eski sürüm yok sayar
    byTable.set(r.tbl, [...(byTable.get(r.tbl) ?? []), r]);
  }
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const [tbl, list] of byTable) {
      const t = table(tbl);
      const locals = await t.bulkGet(list.map((r) => r.id));
      const puts: (SyncFields & Record<string, unknown>)[] = [];
      list.forEach((r, i) => {
        const local = locals[i];
        const decision = shouldApply(local, r);
        observe(r.updated_at);
        if (decision === 'apply') {
          puts.push({ ...r.data, id: r.id, updatedAt: r.updated_at, deleted: r.deleted ? 1 : 0, dirty: 0 } as never);
        } else if (decision === 'ack' && local && local.dirty) {
          puts.push({ ...local, dirty: 0 });
        }
      });
      if (puts.length) await t.bulkPut(puts as never);
    }
  });
}

async function push(): Promise<number> {
  const client = supa()!;
  let sent = 0;
  for (const tbl of SYNC_TABLES) {
    const dirty = await table(tbl).where('dirty').equals(1).toArray();
    for (let i = 0; i < dirty.length; i += 500) {
      const chunk = dirty.slice(i, i + 500);
      const { error } = await client.rpc('push_records', { rows: chunk.map((r) => toRemote(tbl, r)) });
      if (error) throw new Error(error.message);
      // Gönderim sırasında değişmemiş olanların bayrağını indir.
      await db.transaction('rw', db.table(tbl), async () => {
        for (const r of chunk) {
          const cur = await table(tbl).get(r.id);
          if (cur && cur.updatedAt === r.updatedAt) await table(tbl).update(r.id, { dirty: 0 } as never);
        }
      });
      sent += chunk.length;
    }
  }
  return sent;
}

// Yeni bir tablo eklendiğinde artır: eski sürüm o tablonun kayıtlarını atlayıp imleci ilerletmiş olabilir,
// bu yüzden güncellemeden sonra bir kez baştan çekilir (uygulama idempotent olduğu için güvenli).
export const SYNC_SCHEMA = 2;

async function pull(): Promise<number> {
  const client = supa()!;
  if ((await getMeta<number>('syncSchema', 1)) < SYNC_SCHEMA) {
    await setMeta('pullCursor', '1970-01-01T00:00:00Z');
    await setMeta('syncSchema', SYNC_SCHEMA);
  }
  let cursor = await getMeta<string>('pullCursor', '1970-01-01T00:00:00Z');
  // Eşzamanlı commit'leri kaçırmamak için 5 sn geriden başla (uygulama idempotent).
  const start = new Date(new Date(cursor).getTime() - 5000).toISOString();
  let from = start;
  let total = 0;
  for (;;) {
    const { data, error } = await client
      .from('vault_records')
      .select('tbl,id,data,updated_at,deleted,server_ts')
      .gt('server_ts', from)
      .order('server_ts', { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RemoteRow[];
    if (rows.length) {
      await applyRemote(rows);
      from = rows[rows.length - 1].server_ts;
      if (from > cursor) cursor = from;
      total += rows.length;
    }
    if (rows.length < 1000) break;
  }
  await setMeta('pullCursor', cursor);
  return total;
}

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce() {
  const client = supa();
  if (!client) return setStatus({ state: 'disabled' });
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  if (!user) return setStatus({ state: 'signedOut', email: null });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return setStatus({ state: 'offline', email: user.email ?? null });

  // Bu cihazda daha önce başka bir hesap kullanıldıysa verileri karıştırma.
  const lastUser = await getMeta<string | null>('syncUser', null);
  if (lastUser && lastUser !== user.id) {
    await wipeLocal();
  }
  await setMeta('syncUser', user.id);

  setStatus({ state: 'syncing', email: user.email ?? null, error: null });
  try {
    await pull();
    await push();
    setStatus({ state: 'idle', lastSync: Date.now() });
  } catch (e) {
    setStatus({ state: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

export async function wipeLocal() {
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.meta], async () => {
    for (const t of SYNC_TABLES) await db.table(t).clear();
    await db.meta.clear();
  });
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  const client = supa();
  if (!client) {
    setStatus({ state: 'disabled' });
    return;
  }
  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') void syncNow();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  onLocalWrite(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 2000);
  });
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60_000);
  void syncNow();
}

export async function signIn(email: string, password: string) {
  const c = supa();
  if (!c) throw new Error('Supabase yapılandırılmamış');
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const c = supa();
  if (!c) throw new Error('Supabase yapılandırılmamış');
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirm: !data.session };
}

export async function signOut(wipe: boolean) {
  const c = supa();
  if (c) await c.auth.signOut();
  if (wipe) await wipeLocal();
  setStatus({ state: 'signedOut', email: null });
}
