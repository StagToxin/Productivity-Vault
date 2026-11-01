// Pomodoro zamanlayıcı — sayfa değişse ya da uygulama yeniden açılsa bile devam eder
// (bitiş zamanı localStorage'da tutulur).
import { useEffect, useSyncExternalStore } from 'react';

export type Phase = 'focus' | 'short' | 'long';

export interface TimerState {
  phase: Phase;
  running: boolean;
  endsAt: number | null; // çalışıyorsa
  remaining: number; // duraklatılmışsa (ms)
  total: number; // ms
  round: number; // tamamlanan odak sayısı (uzun mola için)
  habitId?: string;
  taskId?: string;
}

const KEY = 'vault.timer';
const subs = new Set<() => void>();
let state: TimerState = load();

function load(): TimerState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && s.phase) return s;
  } catch {
    /* */
  }
  return { phase: 'focus', running: false, endsAt: null, remaining: 25 * 60000, total: 25 * 60000, round: 0 };
}

function set(p: Partial<TimerState>) {
  state = { ...state, ...p };
  localStorage.setItem(KEY, JSON.stringify(state));
  subs.forEach((f) => f());
}

export const getTimer = () => state;

export function useTimer() {
  const s = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), getTimer);
  // her saniye yeniden çiz
  const tick = useSyncExternalStore(subscribeSecond, () => Math.floor(Date.now() / 1000));
  const left = s.running && s.endsAt ? Math.max(0, s.endsAt - tick * 1000) : s.remaining;
  return { ...s, left };
}

let secSubs = new Set<() => void>();
let secTimer: ReturnType<typeof setInterval> | null = null;
function subscribeSecond(f: () => void) {
  secSubs.add(f);
  if (!secTimer) secTimer = setInterval(() => secSubs.forEach((g) => g()), 1000);
  return () => {
    secSubs.delete(f);
    if (!secSubs.size && secTimer) {
      clearInterval(secTimer);
      secTimer = null;
      secSubs = new Set();
    }
  };
}

export function durationFor(phase: Phase, p: { focusMinutes: number; shortBreak: number; longBreak: number }) {
  return (phase === 'focus' ? p.focusMinutes : phase === 'short' ? p.shortBreak : p.longBreak) * 60000;
}

export const timer = {
  start() {
    if (state.running) return;
    set({ running: true, endsAt: Date.now() + state.remaining });
  },
  pause() {
    if (!state.running || !state.endsAt) return;
    set({ running: false, remaining: Math.max(0, state.endsAt - Date.now()), endsAt: null });
  },
  setPhase(phase: Phase, ms: number) {
    set({ phase, running: false, endsAt: null, remaining: ms, total: ms });
  },
  reset(ms: number) {
    set({ running: false, endsAt: null, remaining: ms, total: ms });
  },
  link(p: { habitId?: string; taskId?: string }) {
    set(p);
  },
  /** Süre bittiğinde çağrılır; bir sonraki fazı hazırlar. */
  finish(prefs: { focusMinutes: number; shortBreak: number; longBreak: number }): { completedFocusMin: number } {
    const wasFocus = state.phase === 'focus';
    const mins = wasFocus ? Math.round(state.total / 60000) : 0;
    const round = wasFocus ? state.round + 1 : state.round;
    const next: Phase = wasFocus ? (round % 4 === 0 ? 'long' : 'short') : 'focus';
    const ms = durationFor(next, prefs);
    set({ phase: next, running: false, endsAt: null, remaining: ms, total: ms, round });
    return { completedFocusMin: mins };
  },
  /** Odakta erken bitirme: geçen süreyi kaydet. */
  elapsedFocusMin(): number {
    if (state.phase !== 'focus') return 0;
    const left = state.running && state.endsAt ? state.endsAt - Date.now() : state.remaining;
    return Math.floor((state.total - left) / 60000);
  },
};

/** Uygulama genelinde tek bir yerde çağrılır: süre dolunca kayıt + bildirim. */
export function useTimerWatcher(onDone: (completedFocusMin: number, s: TimerState) => void) {
  useEffect(() => {
    const id = setInterval(() => {
      if (state.running && state.endsAt && Date.now() >= state.endsAt) {
        const snapshot = { ...state };
        const { completedFocusMin } = timer.finish(prefsRef.current);
        onDone(completedFocusMin, snapshot);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [onDone]);
}

export const prefsRef = { current: { focusMinutes: 25, shortBreak: 5, longBreak: 15 } };
