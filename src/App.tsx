import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { EditorHost, openEditor } from './components/Editors';
import { celebrate, toast, Toaster } from './components/ui';
import { PipHost } from './components/MiniTimer';
import { WhatsNew } from './components/WhatsNew';
import { logFocus } from './lib/actions';
import { STREAK_MILESTONES, XP } from './lib/logic';
import { checkDesktopUpdate, closeMiniWindow, isTauri, notify } from './lib/platform';
import { useReminders } from './lib/reminders';
import { useData } from './lib/store';
import { startSync, useSyncStatus } from './lib/sync';
import { useTheme } from './lib/theme';
import { getTimer, useTimerWatcher, type TimerEvent } from './lib/timer';
import { db } from './lib/db';
import Dashboard from './pages/Dashboard';
import FocusPage from './pages/Focus';
import { CalendarPage, HabitsPage, ProjectsPage, TasksPage } from './pages/Lists';
import SettingsPage from './pages/Settings';

const StatsPage = lazy(() => import('./pages/Stats')); // grafik kütüphanesi ayrı yüklenir
const FriendsPage = lazy(() => import('./pages/Friends'));

export type Page = 'dashboard' | 'habits' | 'tasks' | 'projects' | 'calendar' | 'focus' | 'friends' | 'stats' | 'settings';
const PAGES: { id: Page; icon: string; mobile: boolean }[] = [
  { id: 'dashboard', icon: '🏠', mobile: true },
  { id: 'habits', icon: '📅', mobile: true },
  { id: 'tasks', icon: '📁', mobile: true },
  { id: 'projects', icon: '🗂', mobile: false },
  { id: 'calendar', icon: '🗓', mobile: false },
  { id: 'focus', icon: '⏱️', mobile: true },
  { id: 'friends', icon: '👥', mobile: false },
  { id: 'stats', icon: '📈', mobile: false },
  { id: 'settings', icon: '⚙️', mobile: false },
];

function readHash(): Page {
  const h = location.hash.slice(1).split(':')[0] as Page;
  return PAGES.some((p) => p.id === h) ? h : 'dashboard';
}

export default function App() {
  const data = useData();
  const { t, prefs, streak, ready } = data;
  const [page, setPage] = useState<Page>(readHash);
  const [more, setMore] = useState(false);
  const sync = useSyncStatus();
  useTheme(prefs);
  useReminders(data);

  useEffect(() => {
    const f = () => {
      setPage(readHash());
      openEditor(null); // sayfa değişince açık pencereleri kapat
    };
    window.addEventListener('hashchange', f);
    startSync();
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const go = (p: Page) => {
    setMore(false);
    location.hash = p;
    window.scrollTo(0, 0);
  };

  // ---- Seri kutlamaları (Duolingo hissi) ----
  const prevStreak = useRef<{ cur: number; done: boolean } | null>(null);
  useEffect(() => {
    if (!ready) return;
    const prev = prevStreak.current;
    prevStreak.current = { cur: streak.current, done: streak.todayDone };
    if (!prev) return;
    if (!prev.done && streak.todayDone) {
      if (STREAK_MILESTONES.includes(streak.current)) celebrate('🔥', t('streak_milestone', { n: streak.current }));
      else toast(`🔥 ${streak.current} ${t('streak_days')}! ${t('streak_todayDone')}`);
    }
  }, [streak.current, streak.todayDone, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Odak olayları (ders/mola bitti, plan bitti) ----
  const onTimerEvents = useCallback(
    async (evs: TimerEvent[]) => {
      for (const e of evs) {
        if (e.type === 'planDone') {
          celebrate('🏁', t('plan_done'));
          void notify('🏁 ' + t('appName'), t('plan_done'));
          void closeMiniWindow();
          continue;
        }
        const focusMin = e.type === 'focusPartial' ? e.min : e.kind === 'focus' ? e.min : 0;
        let extra = '';
        if (focusMin > 0) {
          const r = await logFocus(focusMin, { habitId: e.habitId, taskId: e.taskId, src: e.type === 'focusPartial' ? e.src : 'timer' });
          const xp = Math.floor(focusMin / 5) * XP.focusPer5Min;
          extra = ` +${xp} XP`;
          if (r?.check?.ok) {
            const task = await db.tasks.get(e.taskId!);
            const c = r.check;
            toast(c.completed ? `🎉 ${task?.title} ${t('done')}!` : `🎯 ${task?.title} ${c.count}/${c.target} (%${Math.round((c.count / c.target) * 100)})`);
          }
        }
        if (e.type === 'focusPartial') {
          toast(`⏱ ${t('sw_saved', { n: focusMin })}${extra}`);
          continue;
        }
        const next = e.next === 'long' ? t('ev_longBreak') : e.next === 'short' ? t('ev_shortBreak') : e.next === 'focus' ? t('ev_lesson') : '';
        const title = e.kind === 'focus' ? '🍅 ' + t('ev_lessonDone') + extra : '☕ ' + t('ev_breakDone');
        const auto = getTimer().running;
        const body = next ? (auto ? next : `${next} · ${t('ev_waiting')}`) : '';
        void notify(title, body || t('appName'));
        toast(`${title}${body ? ' · ' + body : ''}`);
      }
    },
    [t],
  );
  useTimerWatcher(onTimerEvents);

  // Plan/kronometre durunca masaüstündeki küçük pencereyi kapat
  useEffect(() => {
    if (!isTauri) return;
    let wasBusy = false;
    const id = setInterval(() => {
      const s = getTimer();
      const busy = s.active || !!s.swStart || s.swAcc > 0;
      if (wasBusy && !busy) void closeMiniWindow();
      wasBusy = busy;
    }, 1500);
    return () => clearInterval(id);
  }, []);


  // ---- Güncellemeler ----
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Uygulama açık kaldıkça saatte bir yeni sürüm kontrolü
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
    },
  });
  const checkWebUpdate = useCallback(async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    await new Promise((r) => setTimeout(r, 1500));
    return !!reg?.waiting;
  }, []);
  useEffect(() => {
    if (!isTauri) return;
    checkDesktopUpdate()
      .then((u) => u && toast(`${t('update_ready')} v${u.version}`, { label: t('update_now'), run: () => void u.install() }, 20000))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null;

  const content = (() => {
    switch (page) {
      case 'habits':
        return <HabitsPage />;
      case 'tasks':
        return <TasksPage />;
      case 'projects':
        return <ProjectsPage />;
      case 'calendar':
        return <CalendarPage />;
      case 'focus':
        return <FocusPage />;
      case 'stats':
        return (
          <Suspense fallback={<div className="muted">…</div>}>
            <StatsPage />
          </Suspense>
        );
      case 'friends':
        return (
          <Suspense fallback={<div className="muted">…</div>}>
            <FriendsPage goSettings={() => go('settings')} />
          </Suspense>
        );
      case 'settings':
        return <SettingsPage onCheckWebUpdate={checkWebUpdate} />;
      default:
        return <Dashboard go={go} />;
    }
  })();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="icon.svg" alt="" />
          {t('appName')}
        </div>
        {PAGES.map((p) => (
          <button key={p.id} className={'nav-item' + (page === p.id ? ' active' : '')} onClick={() => go(p.id)}>
            <span className="ico">{p.icon}</span>
            {t(`nav_${p.id}` as 'nav_tasks')}
          </button>
        ))}
        <div className="spacer" />
        <div className="nav-item" style={{ cursor: 'default' }}>
          <span className="ico">🔥</span>
          <b>{streak.current}</b>
          <span className="muted small">
            · ⭐ {t('level')} {data.level.level}
          </span>
        </div>
        <button className="sync-pill" onClick={() => go('settings')}>
          <span className={'dot ' + sync.state} />
          {t(`sync_${sync.state}` as 'sync_idle')}
        </button>
      </aside>
      <main className="main">{content}</main>
      <nav className="bottom-nav">
        {PAGES.filter((p) => p.mobile).map((p) => (
          <button key={p.id} className={page === p.id ? 'active' : ''} onClick={() => go(p.id)}>
            <span className="ico">{p.icon}</span>
            {t(`nav_${p.id}` as 'nav_tasks')}
          </button>
        ))}
        <button className={PAGES.some((p) => !p.mobile && p.id === page) ? 'active' : ''} onClick={() => setMore(true)}>
          <span className="ico">☰</span>
          •••
        </button>
      </nav>
      {more && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setMore(false)}>
          <div className="modal">
            {PAGES.filter((p) => !p.mobile).map((p) => (
              <button key={p.id} className={'nav-item' + (page === p.id ? ' active' : '')} style={{ padding: 12, fontSize: 16 }} onClick={() => go(p.id)}>
                <span className="ico">{p.icon}</span>
                {t(`nav_${p.id}` as 'nav_tasks')}
              </button>
            ))}
            <div className="sync-pill" style={{ marginTop: 8 }}>
              <span className={'dot ' + sync.state} />
              {t(`sync_${sync.state}` as 'sync_idle')} · 🔥 {streak.current} · ⭐ {data.level.level}
            </div>
          </div>
        </div>
      )}
      <EditorHost />
      <Toaster />
      <PipHost />
      <WhatsNew />
      {needRefresh && (
        <div className="toasts" style={{ bottom: 'calc(150px + env(safe-area-inset-bottom))' }}>
          <div className="toast">
            🎉 {t('update_ready')}
            <button className="btn primary sm" onClick={() => updateServiceWorker(true)}>
              {t('update_now')}
            </button>
            <button className="btn sm" onClick={() => setNeedRefresh(false)}>
              {t('later')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
