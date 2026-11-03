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
  share?: HabitShare; // arkadaşlarla ortak alışkanlık bağı
}

/** Ortak alışkanlık bağı: alışkanlık sende kalır, yalnızca bu gruba katıldığın günden beri tik gün/saatleri paylaşılır. */
export interface HabitShare {
  groupId: string;
  slotMap?: Record<string, string>; // yerel bölüm id → grup bölüm id
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

/** Hedefli görevde tik şartları (hepsi isteğe bağlı). */
export interface TaskRule {
  gapHours?: number; // iki tik arasında en az bu kadar saat (1–24)
  perDay?: boolean; // takvim günü başına en fazla 1 tik
  focusMin?: number; // tik için göreve bağlı en az bu kadar dakikalık odak gerekir (dolunca otomatik tik)
}

export interface TaskRepeat {
  every: number; // 1..
  unit: 'day' | 'week' | 'month';
}

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Task extends SyncFields {
  title: string;
  notes: string;
  projectId?: string;
  startDate?: string; // YYYY-MM-DD — birden çok güne yayılan görevlerde başlangıç
  dueDate?: string; // YYYY-MM-DD — son gün
  reminderAt?: string; // ISO local "YYYY-MM-DDTHH:MM"
  dueTime?: string; // "HH:MM" — takvimin saat görünümünde yerleşim
  duration?: number; // dakika
  status: TaskStatus;
  priority: Priority;
  doneAt?: number;
  createdAt: number;
  target?: number; // hedefli görev: bu kadar tik atılınca biter (2+)
  rule?: TaskRule;
  repeat?: TaskRepeat; // tekrarlayan görev: bitince bir sonraki oluşturulur
  seriesId?: string; // tekrarlayan görev zincirinin kimliği
  checklist?: CheckItem[]; // alt adımlar
  phase?: string; // proje planında aşama başlığı
  milestone?: 0 | 1; // tek günlük kilometre taşı
}

/** Hedefli görevde atılan her tik ayrı kayıt — iki cihazda çevrimdışı tik atılsa bile birbirini ezmez. */
export interface TaskCheck extends SyncFields {
  taskId: string;
  at: number; // ms
  date: string; // YYYY-MM-DD (gün başlangıç saatine göre)
  focusId?: string; // pomodoro ile otomatik atıldıysa
}

export interface Project extends SyncFields {
  name: string;
  icon: string;
  color: string;
  start?: string; // planın başlangıcı
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
  src?: 'timer' | 'stopwatch' | 'manual'; // lig XP'sinde elle eklenen sayılmaz
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
  | 'focus'
  | 'countdown'
  | 'weekly';

/** Önceden hazırlanan odak planı (ör. 3 saat, 45 dk dersler, 10 dk mola, 3 derste bir 25 dk uzun mola). */
export interface FocusPlan {
  id: string;
  name: string;
  totalMin: number; // toplam süre
  countBreaks: boolean; // true: toplam süreye molalar dahil · false: net çalışma süresi
  blockMin: number; // ders süresi (20–60)
  shortBreak: number; // 0 = kısa mola yok
  longBreak: number; // 0 = uzun mola yok
  longEvery: number; // kaç derste bir uzun mola
  noBreaks: boolean; // tek parça, molasız
  equalize: boolean; // süre tam bölünmezse dersleri eşitle
  autoNext: boolean; // bir bölüm bitince sonrakini otomatik başlat
  taskId?: string;
  habitId?: string;
}

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
  focusPlans?: FocusPlan[];
  miniTimer?: boolean; // masaüstü: pomodoro başlayınca küçük pencere aç
}

export type TableName = 'habits' | 'habitLogs' | 'tasks' | 'projects' | 'focus' | 'prefs' | 'taskChecks';
export const SYNC_TABLES: TableName[] = ['habits', 'habitLogs', 'tasks', 'projects', 'focus', 'prefs', 'taskChecks'];
