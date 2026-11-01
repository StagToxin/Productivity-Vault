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

/** Günde birden fazla onaylanan alışkanlıkların bölümleri (ör. 5 vakit namaz, 3 öğün, 8 bardak su). */
export interface HabitSlot {
  id: string;
  name: string;
  time?: string; // "HH:MM" — planlanan saat (takvimde ve hatırlatmada kullanılır)
}

export interface Habit extends SyncFields {
  name: string;
  icon: string; // emoji
  color: string; // hex
  weeklyTarget: number; // 1..7 — haftada kaç gün
  reminderTime?: string; // "HH:MM"
  slots?: HabitSlot[]; // doluysa gün, tüm bölümler onaylanınca tamamlanır
  days?: number[]; // belirli günler (0=Pzt … 6=Paz). Doluysa haftalık hedef = gün sayısı
  archived: 0 | 1;
  order: number;
  createdAt: number;
}

// id = `${habitId}_${date}` (bölümlü ise `${habitId}_${date}_${slotId}`)
// → iki cihaz aynı günü/bölümü işaretlerse aynı kayıt olur; farklı bölümler birbirini ezmez.
export interface HabitLog extends SyncFields {
  habitId: string;
  date: string; // YYYY-MM-DD
  slotId?: string;
  done: 0 | 1;
  at?: number; // onaylandığı an (ms) — geçmişte "saat kaçta yapıldı" için
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
  dueTime?: string; // "HH:MM" — takvimin saat görünümünde yerleşim
  duration?: number; // dakika
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
  bgDark: string; // gece teması zemin rengi
  bgLight: string; // gündüz teması zemin rengi
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
