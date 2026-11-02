// Odak zamanlayıcısı: plan (ders/mola dizisi) ve kronometre.
// Durum localStorage'da tutulur → sayfa değişse, uygulama yeniden açılsa ya da masaüstündeki küçük pencere
// komut gönderse bile aynı durum paylaşılır ("storage" olayı ile pencereler eşitlenir).
import { useEffect, useSyncExternalStore } from 'react';
import type { Seg, SegKind } from './plan';

export type Mode = 'plan' | 'stopwatch';

/** Ana pencerenin işleyeceği olaylar (kayıt, bildirim). */
export type TimerEvent =
  | { id: string; type: 'segEnd'; kind: SegKind; min: number; next: SegKind | null; habitId?: string; taskId?: string }
  | { id: string; type: 'focusPartial'; min: number; habitId?: string; taskId?: string }
  | { id: string; type: 'planDone' };

export interface TimerState {
  v: 2;
  mode: Mode;
  active: boolean; // bir plan yüklü ve sürüyor (duraklatılmış olabilir)
  segs: Seg[];
  idx: number;
  running: boolean;
  endsAt: number | null;
  remaining: number; // duraklatılmışsa kalan (ms)
  total: number; // mevcut bölümün süresi (ms)
  planName?: string;
  autoNext: boolean;
  swStart: number | null; // kronometre çalışıyorsa başlangıç
  swAcc: number; // kronometre birikmiş (ms)
  habitId?: string;
  taskId?: string;
  queue: TimerEvent[];
}

const KEY = 'vault.timer';
const subs = new Set<() => void>();

function idle(): TimerState {
  return { v: 2, mode: 'plan', active: false, segs: [], idx: 0, running: false, endsAt: null, remaining: 0, total: 0, autoNext: true, swStart: null, swAcc: 0, queue: [] };
}

function load(): TimerState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && s.v === 2) return { ...idle(), ...s };
  } catch {
    /* */
  }
  return idle(); // eski sürümün durumu veya bozuk kayıt
}

let state: TimerState = load();

function set(p: Partial<TimerState>) {
  state = { ...state, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* gizli mod vb. */
  }
  subs.forEach((f) => f());
}

// Diğer pencereden (küçük pencere / ana pencere) gelen değişiklikler
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = load();
    subs.forEach((f) => f());
  });
}

const evId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const elapsedMs = () => (state.running && state.endsAt ? state.total - (state.endsAt - Date.now()) : state.total - state.remaining);

export const getTimer = () => state;

export function useTimer() {
  const s = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), getTimer);
  const tick = useSyncExternalStore(subscribeSecond, () => Math.floor(Date.now() / 1000));
  const now = tick * 1000;
  const left = s.running && s.endsAt ? Math.max(0, s.endsAt - now) : s.remaining;
  const sw = s.swAcc + (s.swStart ? Math.max(0, now - s.swStart) : 0);
  const seg = s.segs[s.idx];
  return { ...s, left, sw, seg, now };
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

function enterSeg(idx: number, run: boolean): Partial<TimerState> {
  const ms = state.segs[idx].min * 60000;
  return { idx, total: ms, remaining: ms, running: run, endsAt: run ? Date.now() + ms : null };
}

export const timer = {
  startPlan(segs: Seg[], opts: { name?: string; autoNext?: boolean; habitId?: string; taskId?: string } = {}) {
    if (!segs.length) return;
    state = { ...state, segs, mode: 'plan' };
    set({ active: true, planName: opts.name, autoNext: opts.autoNext ?? true, habitId: opts.habitId ?? state.habitId, taskId: opts.taskId ?? state.taskId, ...enterSeg(0, true) });
  },
  pause() {
    if (state.mode === 'stopwatch') {
      if (state.swStart) set({ swAcc: state.swAcc + (Date.now() - state.swStart), swStart: null });
      return;
    }
    if (!state.running || !state.endsAt) return;
    set({ running: false, remaining: Math.max(0, state.endsAt - Date.now()), endsAt: null });
  },
  resume() {
    if (state.mode === 'stopwatch') {
      if (!state.swStart) set({ swStart: Date.now() });
      return;
    }
    if (state.running || !state.active) return;
    set({ running: true, endsAt: Date.now() + state.remaining });
  },
  /** Molayı geç ya da dersi erken bitir (geçen süre kaydedilir) ve sonraki bölüme geç. */
  skip() {
    if (state.mode !== 'plan' || !state.active) return;
    const seg = state.segs[state.idx];
    const queue = [...state.queue];
    if (seg.kind === 'focus') {
      const min = Math.floor(elapsedMs() / 60000);
      if (min > 0) queue.push({ id: evId(), type: 'focusPartial', min, habitId: state.habitId, taskId: state.taskId });
    }
    const next = state.idx + 1;
    if (next >= state.segs.length) {
      set({ ...idlePlan(), queue: [...queue, { id: evId(), type: 'planDone' }] });
      return;
    }
    state = { ...state, queue };
    set({ ...enterSeg(next, true) });
  },
  /** Planı tamamen durdur (derste geçen süre kaydedilir). */
  stop() {
    if (state.mode !== 'plan') return;
    const seg = state.segs[state.idx];
    const queue = [...state.queue];
    if (state.active && seg?.kind === 'focus') {
      const min = Math.floor(elapsedMs() / 60000);
      if (min > 0) queue.push({ id: evId(), type: 'focusPartial', min, habitId: state.habitId, taskId: state.taskId });
    }
    set({ ...idlePlan(), queue });
  },
  link(p: { habitId?: string; taskId?: string }) {
    set(p);
  },
  setMode(mode: Mode) {
    set({ mode });
  },
  // ---- kronometre ----
  swStart() {
    set({ mode: 'stopwatch', swStart: state.swStart ?? Date.now() });
  },
  /** Kronometreyi bitir ve kaydet. */
  swFinish() {
    const ms = state.swAcc + (state.swStart ? Date.now() - state.swStart : 0);
    const min = Math.floor(ms / 60000);
    const queue = [...state.queue];
    if (min > 0) queue.push({ id: evId(), type: 'focusPartial', min, habitId: state.habitId, taskId: state.taskId });
    set({ swStart: null, swAcc: 0, queue });
    return min;
  },
  swReset() {
    set({ swStart: null, swAcc: 0 });
  },
  /** Süre dolduysa bölümü tamamla (yalnızca ana pencere çağırır). */
  tick() {
    if (state.mode !== 'plan' || !state.active || !state.running || !state.endsAt || Date.now() < state.endsAt) return;
    const seg = state.segs[state.idx];
    const next = state.idx + 1;
    const ev: TimerEvent = { id: evId(), type: 'segEnd', kind: seg.kind, min: seg.min, next: state.segs[next]?.kind ?? null, habitId: state.habitId, taskId: state.taskId };
    if (next >= state.segs.length) {
      set({ ...idlePlan(), queue: [...state.queue, ev, { id: evId(), type: 'planDone' }] });
      return;
    }
    state = { ...state, queue: [...state.queue, ev] };
    set({ ...enterSeg(next, state.autoNext) });
  },
  /** Bekleyen olayları al ve kuyruğu boşalt. */
  drain(): TimerEvent[] {
    if (!state.queue.length) return [];
    const q = state.queue;
    set({ queue: [] });
    return q;
  },
};

function idlePlan(): Partial<TimerState> {
  return { active: false, running: false, endsAt: null, remaining: 0, total: 0, segs: [], idx: 0, planName: undefined };
}

/** Uygulama genelinde tek yerde (ana pencere): süre dolunca bölümü bitir, olayları işle. */
export function useTimerWatcher(onEvents: (evs: TimerEvent[]) => void) {
  useEffect(() => {
    const run = () => {
      timer.tick();
      const evs = timer.drain();
      if (evs.length) onEvents(evs);
    };
    run();
    const id = setInterval(run, 1000);
    return () => clearInterval(id);
  }, [onEvents]);
}

export const fmtClock = (ms: number, withHours = false) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 || withHours ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
};
