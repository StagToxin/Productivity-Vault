// Tüm eşitlenen kayıtların ortak alanları.
// updatedAt: son değişiklik zamanı (ms) — çakışmada "son yazan kazanır".
// deleted: silinen kayıtlar fiziksel silinmez, diğer cihazlara iletilmek için işaretlenir.
// dirty: 1 = buluta henüz gönderilmedi (Dexie boolean indexlemediği için sayı).
export interface SyncFields {
  id: string;
  updatedAt: number;
  deleted: 0 | 1;
  dirty: 0 | 1;
}

export interface Habit extends SyncFields {
  name: string;
  icon: string; // emoji
  color: string; // hex
  weeklyTarget: number; // 1..7 — haftada kaç gün
  reminderTime?: string; // "HH:MM"
  archived: 0 | 1;
  order: number;
  createdAt: number;
}

// id = `${habitId}_${date}` → iki cihaz aynı günü işaretlerse aynı kayıt olur, çakışma çıkmaz.
export interface HabitLog extends SyncFields {
  habitId: string;
  date: string; // YYYY-MM-DD
  done: 0 | 1;
  minutes: number; // pomodoro'dan gelen süre
}

export type TaskStatus = 'todo' | 'doing' | 'done';
export type Priority = 0 | 1 | 2; // düşük, orta, yüksek

export interface Task extends SyncFields {
  title: string;
  notes: string;
  projectId?: string;
  dueDate?: string; // YYYY-MM-DD
  reminderAt?: string; // ISO local "YYYY-MM-DDTHH:MM"
  status: TaskStatus;
  priority: Priority;
  doneAt?: number;
  createdAt: number;
}

export interface Project extends SyncFields {
  name: string;
  icon: string;
  color: string;
  deadline?: string;
  status: 'active' | 'done';
  createdAt: number;
}

export interface FocusSession extends SyncFields {
  start: number;
  minutes: number;
  habitId?: string;
  taskId?: string;
  date: string;
}

export type ThemeMode = 'dark' | 'light' | 'system' | 'time';
export type Lang = 'tr' | 'en';

export interface WidgetPref {
  id: WidgetId;
  hidden: boolean;
  collapsed: boolean;
}

export type WidgetId =
  | 'performance'
  | 'streak'
  | 'actions'
  | 'habits'
  | 'habitGrid'
  | 'tasks'
  | 'projects'
  | 'calendar'
  | 'habitStats'
  | 'focus';

export interface Prefs extends SyncFields {
  theme: ThemeMode;
  accent: string;
  lang: Lang;
  dailyGoalXp: number;
  focusMinutes: number;
  shortBreak: number;
  longBreak: number;
  weekStartsMonday: boolean;
  notifications: boolean;
  streakReminderTime: string; // "HH:MM" — seri tehlikedeyse hatırlat
  dayStartHour: number; // gece kuşları için: gün bu saatte biter
  lightFrom: number; // 'time' teması: açık tema başlangıç saati
  lightTo: number;
  widgets: WidgetPref[];
  displayName: string;
}

export type TableName = 'habits' | 'habitLogs' | 'tasks' | 'projects' | 'focus' | 'prefs';
export const SYNC_TABLES: TableName[] = ['habits', 'habitLogs', 'tasks', 'projects', 'focus', 'prefs'];
