// Uygulama açıkken (veya masaüstünde arka planda) çalışan hatırlatıcı zamanlayıcı.
import { useEffect, useRef } from 'react';
import { notify } from './platform';
import type { AppData } from './store';

const SENT_KEY = 'vault.sentReminders';

function sentSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
function markSent(s: Set<string>, key: string) {
  s.add(key);
  // sadece son 300 kaydı tut
  localStorage.setItem(SENT_KEY, JSON.stringify([...s].slice(-300)));
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function useReminders(data: AppData) {
  const ref = useRef(data);
  ref.current = data;

  useEffect(() => {
    const check = () => {
      const d = ref.current;
      if (!d.ready || !d.prefs.notifications) return;
      const now = new Date();
      const time = hhmm(now);
      const sent = sentSet();
      const t = d.t;

      // Alışkanlık hatırlatıcıları — saati geçtiyse ve bugün yapılmadıysa bir kez
      for (const h of d.habits) {
        if (h.archived || !h.reminderTime || time < h.reminderTime) continue;
        const key = `h:${h.id}:${d.today}`;
        if (sent.has(key)) continue;
        const done = d.logs.some((l) => l.habitId === h.id && l.date === d.today && l.done);
        markSent(sent, key);
        if (!done) void notify(`${h.icon} ${h.name}`, t('not_completed'));
      }
      // Görev hatırlatıcıları
      for (const task of d.tasks) {
        if (!task.reminderAt || task.status === 'done') continue;
        const at = new Date(task.reminderAt);
        if (now < at || now.getTime() - at.getTime() > 12 * 3600_000) continue;
        const key = `t:${task.id}:${task.reminderAt}`;
        if (sent.has(key)) continue;
        markSent(sent, key);
        void notify(`📌 ${task.title}`, task.dueDate === d.today ? t('due_today') : t('reminder'));
      }
      // Seri hatırlatma
      if (!d.streak.todayDone && d.streak.current > 0 && time >= d.prefs.streakReminderTime) {
        const key = `s:${d.today}`;
        if (!sent.has(key)) {
          markSent(sent, key);
          void notify(t('streak_atRisk'), `${d.streak.current} ${t('streak_days')}`);
        }
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);
}
