// Uygulamadaki tüm yazma işlemleri burada toplanır.
import { db, patch, put, softDelete, uid } from './db';
import { addDays, fromKey, todayKey } from './dates';
import type { FocusSession, Habit, HabitLog, Prefs, Project, Task, WidgetId, WidgetPref } from './types';

export const ACCENTS = ['#f08c3a', '#4c8dff', '#2fb380', '#e0567a', '#9b6bff', '#e5b931', '#26b5c9', '#ff6b4a'];
// Tema zemin renkleri (gece / gündüz). Diğer yüzey renkleri bunlardan türetilir.
export const DARK_BGS = ['#191919', '#0d1117', '#000000', '#1e1e2e', '#1a1b26', '#2e3440', '#13201a', '#221419', '#1b1a2e', '#24201b'];
export const LIGHT_BGS = ['#f7f7f5', '#ffffff', '#f4ecd8', '#eef2f7', '#f3f0ff', '#eef6ef', '#fdf1f3', '#f5f5f0'];

// Bölümlü alışkanlık hazır şablonları
export const SLOT_PRESETS: { key: string; icon: string; slots: { name: string; time?: string }[] }[] = [
  { key: 'prayer', icon: '🕌', slots: [{ name: 'Sabah', time: '05:30' }, { name: 'Öğle', time: '13:00' }, { name: 'İkindi', time: '16:30' }, { name: 'Akşam', time: '18:30' }, { name: 'Yatsı', time: '20:00' }] },
  { key: 'meals', icon: '🍽️', slots: [{ name: 'Kahvaltı', time: '08:00' }, { name: 'Öğle', time: '13:00' }, { name: 'Akşam', time: '19:00' }] },
  { key: 'water', icon: '💧', slots: Array.from({ length: 8 }, (_, i) => ({ name: `${i + 1}. bardak`, time: `${String(8 + Math.floor((i * 14) / 8)).padStart(2, '0')}:00` })) },
  { key: 'meds', icon: '💊', slots: [{ name: 'Sabah', time: '09:00' }, { name: 'Akşam', time: '21:00' }] },
];

export const HABIT_COLORS = ['#e8932f', '#3d82f0', '#e07020', '#d6488e', '#2fb380', '#9b6bff', '#d9b02a', '#26b5c9', '#e5484d', '#8a8f98'];
export const EMOJIS = ['💻', '📖', '🏋️', '🧴', '🥗', '💧', '🧘', '🏃', '🎧', '✍️', '🎨', '🎸', '🌙', '🧹', '💊', '🚭', '📚', '🧠', '🎯', '🌱', '📝', '🎬', '🚀', '💡', '📌', '🛠️', '📱', '💰', '🗣️', '🐶'];

export const DEFAULT_WIDGETS: WidgetId[] = ['performance', 'streak', 'habits', 'habitGrid', 'actions', 'tasks', 'focus', 'projects', 'habitStats', 'calendar'];

export function defaultPrefs(): Omit<Prefs, 'updatedAt' | 'dirty' | 'deleted'> {
  return {
    id: 'prefs',
    theme: 'system',
    accent: ACCENTS[0],
    bgDark: DARK_BGS[0],
    bgLight: LIGHT_BGS[0],
    lang: (typeof navigator !== 'undefined' && !navigator.language.startsWith('tr') ? 'en' : 'tr'),
    dailyGoalXp: 10,
    focusMinutes: 25,
    shortBreak: 5,
    longBreak: 15,
    weekStartsMonday: true,
    notifications: false,
    streakReminderTime: '20:00',
    dayStartHour: 0,
    lightFrom: 7,
    lightTo: 19,
    widgets: DEFAULT_WIDGETS.map((id) => ({ id, hidden: false, collapsed: false })),
    displayName: '',
  };
}

/** Yeni sürümde eklenen widget'lar eski kullanıcı düzenine sona eklenir. */
export function normalizeWidgets(list: WidgetPref[] | undefined): WidgetPref[] {
  const seen = new Set<string>();
  const out: WidgetPref[] = [];
  for (const w of list ?? []) {
    if (DEFAULT_WIDGETS.includes(w.id) && !seen.has(w.id)) {
      seen.add(w.id);
      out.push(w);
    }
  }
  for (const id of DEFAULT_WIDGETS) if (!seen.has(id)) out.push({ id, hidden: false, collapsed: false });
  return out;
}

export async function updatePrefs(changes: Partial<Prefs>) {
  const cur = await db.prefs.get('prefs');
  await put<Prefs>('prefs', { ...defaultPrefs(), ...(cur ?? {}), ...changes, id: 'prefs' } as Prefs);
}

// ---------- Alışkanlıklar ----------
export async function saveHabit(h: Partial<Habit> & { name: string }) {
  if (h.id) {
    await patch<Habit>('habits', h.id, h);
    return h.id;
  }
  const count = await db.habits.count();
  const row = await put<Habit>('habits', {
    id: uid(),
    name: h.name,
    icon: h.icon ?? '🎯',
    color: h.color ?? HABIT_COLORS[count % HABIT_COLORS.length],
    weeklyTarget: h.weeklyTarget ?? 7,
    reminderTime: h.reminderTime,
    slots: h.slots,
    days: h.days,
    archived: 0,
    order: count,
    createdAt: Date.now(),
  });
  return row.id;
}

/** Gün (veya bölüm) onayını tersine çevirir; onay anını kaydeder. */
export async function toggleHabit(habitId: string, date = todayKey(), slotId?: string) {
  const id = slotId ? `${habitId}_${date}_${slotId}` : `${habitId}_${date}`;
  const cur = await db.habitLogs.get(id);
  const done = cur && cur.done && !cur.deleted ? 0 : 1;
  await setHabitDone(habitId, date, done === 1, slotId);
  return done === 1;
}

export async function setHabitDone(habitId: string, date: string, done: boolean, slotId?: string) {
  const id = slotId ? `${habitId}_${date}_${slotId}` : `${habitId}_${date}`;
  const cur = await db.habitLogs.get(id);
  await put<HabitLog>('habitLogs', {
    id, habitId, date, slotId, done: done ? 1 : 0, at: done ? Date.now() : undefined, minutes: cur?.minutes ?? 0, deleted: 0,
  });
}

/** Bölümlü alışkanlıkta günün tüm bölümlerini birlikte işaretler / kaldırır. */
export async function setAllSlots(h: Habit, date: string, done: boolean) {
  for (const s of h.slots ?? []) await setHabitDone(h.id, date, done, s.id);
}

/** Sıradaki onaylanmamış bölümü işaretler (hızlı "tamamla" düğmesi için). */
export async function checkNextSlot(h: Habit, date = todayKey()) {
  for (const s of h.slots ?? []) {
    const cur = await db.habitLogs.get(`${h.id}_${date}_${s.id}`);
    if (!cur || !cur.done || cur.deleted) {
      await setHabitDone(h.id, date, true, s.id);
      return s;
    }
  }
  return null;
}

export async function addHabitMinutes(habitId: string, minutes: number, date = todayKey()) {
  const id = `${habitId}_${date}`;
  const cur = await db.habitLogs.get(id);
  await put<HabitLog>('habitLogs', {
    id, habitId, date, done: cur?.done ?? 0, minutes: (cur?.minutes ?? 0) + minutes, deleted: 0,
  });
}

export async function reorderHabits(ids: string[]) {
  await Promise.all(ids.map((id, i) => patch<Habit>('habits', id, { order: i })));
}

export const deleteHabit = (id: string) => softDelete('habits', id);

// ---------- Görevler ----------
export async function saveTask(t: Partial<Task> & { title: string }) {
  if (t.id) {
    await patch<Task>('tasks', t.id, t);
    return t.id;
  }
  const row = await put<Task>('tasks', {
    id: uid(),
    title: t.title,
    notes: t.notes ?? '',
    projectId: t.projectId,
    dueDate: t.dueDate,
    reminderAt: t.reminderAt,
    dueTime: t.dueTime,
    duration: t.duration,
    status: t.status ?? 'todo',
    priority: t.priority ?? 1,
    createdAt: Date.now(),
  });
  return row.id;
}

export async function setTaskStatus(id: string, status: Task['status']) {
  await patch<Task>('tasks', id, { status, doneAt: status === 'done' ? Date.now() : undefined });
}

export const deleteTask = (id: string) => softDelete('tasks', id);

// ---------- Projeler ----------
export async function saveProject(p: Partial<Project> & { name: string }) {
  if (p.id) {
    await patch<Project>('projects', p.id, p);
    return p.id;
  }
  const row = await put<Project>('projects', {
    id: uid(),
    name: p.name,
    icon: p.icon ?? '📌',
    color: p.color ?? HABIT_COLORS[1],
    deadline: p.deadline,
    status: 'active',
    createdAt: Date.now(),
  });
  return row.id;
}

export async function deleteProject(id: string) {
  // Görevleri silme, projesiz bırak
  const tasks = await db.tasks.where('projectId').equals(id).toArray();
  await Promise.all(tasks.map((t) => patch<Task>('tasks', t.id, { projectId: undefined })));
  await softDelete('projects', id);
}

// ---------- Odak ----------
export async function logFocus(minutes: number, opts: { habitId?: string; taskId?: string } = {}) {
  if (minutes <= 0) return;
  await put<FocusSession>('focus', {
    id: uid(), start: Date.now() - minutes * 60000, minutes, habitId: opts.habitId, taskId: opts.taskId, date: todayKey(),
  });
  if (opts.habitId) await addHabitMinutes(opts.habitId, minutes);
}

// ---------- Örnek veri ----------
export async function seedSample() {
  const today = todayKey();
  const habits = [
    { name: '5 Saat Derin Çalışma', icon: '💻', color: '#e8932f', weeklyTarget: 5 },
    { name: 'Okuma / Podcast', icon: '📖', color: '#3d82f0', weeklyTarget: 7 },
    { name: '2 Saat Spor', icon: '🏋️', color: '#e07020', weeklyTarget: 4 },
    { name: 'Cilt + Saç Bakımı', icon: '🧴', color: '#d6488e', weeklyTarget: 7 },
  ];
  const ids: string[] = [];
  const prayerSlots = SLOT_PRESETS[0].slots.map((x) => ({ ...x, id: uid() }));
  const prayerId = await saveHabit({ name: '5 Vakit Namaz', icon: '🕌', color: '#2fb380', weeklyTarget: 7, slots: prayerSlots });
  await patch<Habit>('habits', prayerId, { createdAt: Date.now() - 61 * 86400000 });
  for (let i = 60; i >= 0; i--) {
    const d = addDays(today, -i);
    for (const [j, sl] of prayerSlots.entries()) {
      if (i === 0 && j > 1) continue; // bugün: sadece sabah + öğle
      if (Math.random() < 0.85) {
        const [hh, mm] = sl.time!.split(':').map(Number);
        const at = new Date(fromKey(d).getTime() + (hh * 60 + mm + Math.floor(Math.random() * 40)) * 60000).getTime();
        await put<HabitLog>('habitLogs', { id: `${prayerId}_${d}_${sl.id}`, habitId: prayerId, date: d, slotId: sl.id, done: 1, at, minutes: 0, deleted: 0 });
      }
    }
  }
  for (const h of habits) {
    const id = await saveHabit(h);
    await patch<Habit>('habits', id, { createdAt: Date.now() - 61 * 86400000 });
    ids.push(id);
  }
  // geçmiş 60 gün
  for (let i = 60; i >= 0; i--) {
    const d = addDays(today, -i);
    for (const [j, id] of ids.entries()) {
      const p = [0.75, 0.85, 0.55, 0.7][j];
      if (Math.random() < p || i < 4) {
        await put<HabitLog>('habitLogs', { id: `${id}_${d}`, habitId: id, date: d, done: 1, at: fromKey(d).getTime() + (7 + Math.random() * 15) * 3600000, minutes: j === 0 ? 25 * Math.ceil(Math.random() * 4) : 0, deleted: 0 });
      }
    }
    if (Math.random() < 0.6) {
      await put<FocusSession>('focus', { id: uid(), start: Date.now() - i * 86400000, minutes: 25 * Math.ceil(Math.random() * 3), date: d });
    }
  }
  const p1 = await saveProject({ name: 'Tasarım', icon: '🎨', color: '#d6488e', deadline: addDays(today, 6) });
  const p2 = await saveProject({ name: 'İçerik Üretimi', icon: '🎬', color: '#3d82f0', deadline: addDays(today, -1) });
  const p3 = await saveProject({ name: 'Öğren / Üret', icon: '🧠', color: '#2fb380', deadline: addDays(today, 5) });
  const p4 = await saveProject({ name: 'Uygulama Lansmanı', icon: '🚀', color: '#e8932f', deadline: addDays(today, 12) });
  const tasks: [string, string | undefined, number, 0 | 1 | 2][] = [
    ['Matcha teması', p3, 0, 1], ['DaVinci öğren', p3, 0, 2], ['Carousel tasarımı', p2, 0, 1],
    ['Uygulama demosu', p4, 1, 2], ['Haftalık e-posta', p1, 4, 0], ['Lansman sayfası', p4, 3, 1],
    ['İçerik planı', p2, 6, 1], ['Logo revizyonu', p1, -2, 2], ['Faturaları öde', undefined, 2, 1],
  ];
  for (const [i, [title, projectId, off, priority]] of tasks.entries())
    await saveTask({ title, projectId, dueDate: addDays(today, off), priority, dueTime: i % 2 ? `${String(9 + (i % 8)).padStart(2, '0')}:00` : undefined, duration: 60 });
  const doneIds: string[] = [];
  for (let i = 1; i <= 8; i++) doneIds.push(await saveTask({ title: `Biten görev ${i}`, projectId: [p1, p2, p3, p4][i % 4], dueDate: addDays(today, -i), priority: 1 }));
  for (const [i, id] of doneIds.entries()) await patch<Task>('tasks', id, { status: 'done', doneAt: Date.now() - i * 86400000 * 1.5 });
}
