// Sürüm notları: güncellemeden sonra "Yenilikler" penceresinde gösterilir.
// Yeni sürüm çıkarırken en üste ekle (sürüm numarası package.json ile aynı olmalı).
export interface ReleaseNote {
  version: string;
  date: string;
  tr: { added: string[]; changed: string[]; fixed: string[] };
  en: { added: string[]; changed: string[]; fixed: string[] };
}

export const CHANGELOG: ReleaseNote[] = [
  {
    version: '1.4.0',
    date: '2026-11',
    tr: {
      added: [
        '👥 Arkadaşlar: davet koduyla arkadaş ekle (Arkadaşlar sayfası).',
        '🏆 Liderlik tablosu: bu hafta, bu ay ve 🔥 seri. Başlangıçta kapalı; "Tabloda görün" ile açılır. Sadece adın, lig XP’n ve serin görünür.',
        '🫂 Ortak alışkanlık: bir alışkanlığını arkadaşlarınla birlikte yap, birbirinizin gününü/saatini ve serisini gör, 👏 tebrik et ya da 👉 dürt. Ayrılınca paylaşılmış günlerin silinir, alışkanlık sende kalır.',
      ],
      changed: ['Lig XP’si kasılmaya karşı sınırlı sayılır (Arkadaşlar > "Lig XP’si nasıl hesaplanır?"). Kendi seviyen ve XP’n değişmedi.'],
      fixed: [],
    },
    en: {
      added: [
        '👥 Friends: add friends with an invite code (Friends page).',
        '🏆 Leaderboard: this week, this month and 🔥 streak. Off by default; turn on "Show me". Only your name, league XP and streak are visible.',
        '🫂 Shared habits: do a habit together, see each other’s days/times and streaks, 👏 cheer or 👉 nudge. Leaving deletes your shared days; the habit stays with you.',
      ],
      changed: ['League XP is capped against farming (Friends > "How is league XP counted?"). Your own level and XP are unchanged.'],
      fixed: [],
    },
  },
  {
    version: '1.3.0',
    date: '2026-11',
    tr: {
      added: [
        '🎯 Hedefli görevler: "9 Kasım\'a kadar 3 kez çalış" gibi; her tik sayılır, yüzde ve tempo (yolunda/geride) görünür.',
        '🔒 Tik şartları: günde 1, her X saatte bir, pomodoro şartı (odak bitince tik otomatik atılır).',
        '🔁 Tekrarlayan görevler ve ☑ alt adımlar.',
        '🗂 Proje detayı: aktif/biten/yapılamayan görevler, 12 aylık takvim şeridi ve Gantt planı (sürükleyerek düzenleme).',
        '⚡ Hızlı plan: satır satır yaz ("Literatür 10g", "Ara rapor !"), uygulama tarihlere dağıtsın.',
        '🗓 Takvimde basılı tutup sürükleyerek çoklu seçim; seçime art arda görev/alışkanlık ekleme.',
        '🍅 Yeni odak: süreyi ver, dersler ve molalar otomatik planlansın; kayıtlı planlar; ⏱ kronometre.',
        '⧉ Bilgisayarda her zaman üstte duran küçük zamanlayıcı penceresi.',
        '⏳ Geri sayım ve 🧾 haftalık özet pano bileşenleri.',
      ],
      changed: ['Uygulamanın adı artık "Verim Asistanı", yeni simge.', 'Odak bölümü kısa/uzun mola sekmeleri yerine plan olarak çalışıyor.'],
      fixed: ['Panoda projeye bağlı, tarihi ileride olan görevler görünmüyordu ("Yaklaşan" sekmesi eklendi).', 'Supabase adresi hatalı girilince hesap açılamıyordu; adres artık otomatik düzeltiliyor.'],
    },
    en: {
      added: [
        '🎯 Target tasks: e.g. "study 3 times before Nov 9"; every check counts, with percentage and pace.',
        '🔒 Check rules: once a day, every X hours, require Pomodoro (finishing focus checks automatically).',
        '🔁 Repeating tasks and ☑ checklists.',
        '🗂 Project detail: active/done/missed tasks, a 12-month strip and a Gantt plan (drag to edit).',
        '⚡ Quick plan: write one item per line ("Research 10d", "Report !") and the app schedules it.',
        '🗓 Drag to select multiple slots in the calendar; add tasks/habits to the selection one after another.',
        '🍅 New focus: set a duration and lessons/breaks are planned automatically; saved plans; ⏱ stopwatch.',
        '⧉ Always-on-top mini timer window on desktop.',
        '⏳ Countdown and 🧾 weekly summary dashboard widgets.',
      ],
      changed: ['The app is now called "Verim Asistanı" with a new icon.', 'Focus works as a plan instead of focus/short/long tabs.'],
      fixed: ['Project tasks due later did not show on the dashboard (added "Upcoming").', 'Sign-up failed with a malformed Supabase URL; it is now corrected automatically.'],
    },
  },
];

export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Görülen sürümden sonra gelen ve şu anki sürüme kadar olan notlar (yeniden eskiye). */
export function notesBetween(seen: string, current: string): ReleaseNote[] {
  return CHANGELOG.filter((n) => cmpVersion(n.version, seen) > 0 && cmpVersion(n.version, current) <= 0);
}
