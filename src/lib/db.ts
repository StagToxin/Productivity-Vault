import Dexie, { type Table } from 'dexie';
import type { FocusSession, Habit, HabitLog, Prefs, Project, SyncFields, TableName, Task } from './types';

export interface MetaRow {
  key: string;
  value: unknown;
}

class VaultDB extends Dexie {
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  tasks!: Table<Task, string>;
  projects!: Table<Project, string>;
  focus!: Table<FocusSession, string>;
  prefs!: Table<Prefs, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('productivity-vault');
    // Şema değişirse yeni bir version(n) ekle; Dexie eski veriyi otomatik taşır.
    this.version(1).stores({
      habits: 'id, dirty, order',
      habitLogs: 'id, dirty, habitId, date',
      tasks: 'id, dirty, projectId, dueDate, status',
      projects: 'id, dirty',
      focus: 'id, dirty, date',
      prefs: 'id, dirty',
      meta: 'key',
    });
  }
}

export const db = new VaultDB();

export function table(name: TableName): Table<SyncFields & Record<string, unknown>, string> {
  return db.table(name);
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Mantıksal saat: hem duvar saatini hem de görülen en yeni kaydı takip eder.
// Böylece saati ileride olan bir cihazın yazdığı kaydı düzenlediğinde, yeni düzenleme yine "daha yeni" sayılır.
let lastTs = 0;
export function now(): number {
  const t = Date.now();
  lastTs = t > lastTs ? t : lastTs + 1;
  return lastTs;
}
export function observe(ts: number) {
  if (ts > lastTs) lastTs = ts;
}

type Listener = () => void;
const writeListeners = new Set<Listener>();
export function onLocalWrite(fn: Listener) {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}
function emitWrite() {
  writeListeners.forEach((f) => f());
}

/** Kaydı ekler veya alanlarını günceller; eşitleme için dirty işaretler. */
export async function put<T extends SyncFields>(name: TableName, row: Omit<T, 'updatedAt' | 'dirty' | 'deleted'> & Partial<SyncFields>) {
  const cur = await table(name).get(row.id);
  if (cur) observe(cur.updatedAt);
  const full = { deleted: 0, ...row, updatedAt: now(), dirty: 1 } as unknown as T;
  await table(name).put(full as never);
  emitWrite();
  return full;
}

export async function patch<T extends SyncFields>(name: TableName, id: string, changes: Partial<T>) {
  const cur = await table(name).get(id);
  if (cur) observe(cur.updatedAt);
  await table(name).update(id, { ...changes, updatedAt: now(), dirty: 1 } as never);
  emitWrite();
}

export async function softDelete(name: TableName, id: string) {
  const cur = await table(name).get(id);
  if (cur) observe(cur.updatedAt);
  await table(name).update(id, { deleted: 1, updatedAt: now(), dirty: 1 } as never);
  emitWrite();
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return (row?.value as T) ?? fallback;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}
