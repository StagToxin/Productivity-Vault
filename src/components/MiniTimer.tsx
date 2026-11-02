// Küçük zamanlayıcı: masaüstünde her zaman üstte duran pencere ve tarayıcıda "resim içinde resim" için ortak arayüz.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { closeSelf, isTauri } from '../lib/platform';
import { useData } from '../lib/store';
import { fmtClock, timer, useTimer } from '../lib/timer';

type T = ReturnType<typeof useData>['t'];

export function segLabel(tm: ReturnType<typeof useTimer>, t: T): string {
  if (tm.mode === 'stopwatch') return '⏱ ' + t('stopwatch');
  if (!tm.active || !tm.seg) return t('fc_idle');
  if (tm.seg.kind === 'focus') {
    const blocks = tm.segs.filter((s) => s.kind === 'focus').length;
    const n = tm.segs.slice(0, tm.idx + 1).filter((s) => s.kind === 'focus').length;
    return `🍅 ${t('lesson')} ${n}/${blocks}`;
  }
  return tm.seg.kind === 'long' ? '🌴 ' + t('long_break') : '☕ ' + t('short_break');
}

export function MiniTimer({ standalone = false }: { standalone?: boolean }) {
  const { t } = useData();
  const tm = useTimer();
  const sw = tm.mode === 'stopwatch';
  const isBreak = !sw && tm.active && tm.seg && tm.seg.kind !== 'focus';
  const running = sw ? !!tm.swStart : tm.running;
  const shown = sw ? fmtClock(tm.sw) : tm.active ? fmtClock(tm.left) : '--:--';
  const pct = sw ? 0 : tm.total ? 1 - tm.left / tm.total : 0;
  const idle = sw ? !tm.swStart && !tm.swAcc : !tm.active;
  return (
    <div className={'mini' + (isBreak ? ' brk' : '')}>
      <div className="mini-top" data-tauri-drag-region>
        <span data-tauri-drag-region>{segLabel(tm, t)}</span>
        {standalone && (
          <button className="mini-x" onClick={() => void closeSelf()} aria-label="✕">
            ✕
          </button>
        )}
      </div>
      <div className="mini-time" data-tauri-drag-region>
        {shown}
      </div>
      {!sw && <div className="mini-bar"><i style={{ width: `${pct * 100}%` }} /></div>}
      <div className="mini-btns">
        {idle ? (
          <span className="small muted">{sw ? t('stopwatch') : t('fc_idle')}</span>
        ) : (
          <>
            <button onClick={() => (running ? timer.pause() : timer.resume())} title={running ? t('pause') : t('resume')}>
              {running ? '⏸' : '▶'}
            </button>
            {isBreak && (
              <button onClick={() => timer.skip()} title={t('skip_break')}>
                ⏭ {t('skip_break')}
              </button>
            )}
            <button onClick={() => (sw ? timer.swFinish() : timer.stop())} title={sw ? t('sw_finish') : t('stop')}>
              ⏹
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Tarayıcıda resim içinde resim ----------
let pipWin: Window | null = null;
const pipSubs = new Set<() => void>();
const emit = () => pipSubs.forEach((f) => f());

export async function openPip() {
  const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
  if (!dpip) return;
  if (pipWin) return pipWin.focus();
  const w = await dpip.requestWindow({ width: 280, height: 150 });
  // stilleri ve tema değişkenlerini kopyala
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) w.document.head.appendChild(node.cloneNode(true));
  const root = document.documentElement;
  w.document.documentElement.setAttribute('style', root.getAttribute('style') ?? '');
  if (root.dataset.theme) w.document.documentElement.dataset.theme = root.dataset.theme;
  w.document.body.className = 'pip-body';
  w.addEventListener('pagehide', () => {
    pipWin = null;
    emit();
  });
  pipWin = w;
  emit();
}

export function PipHost() {
  const w = useSyncExternalStore((f) => (pipSubs.add(f), () => pipSubs.delete(f)), () => pipWin);
  if (!w) return null;
  return createPortal(<MiniTimer />, w.document.body);
}

/** Masaüstü küçük pencerenin kökü (mini.html). */
export function MiniApp() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.body.classList.add('mini-body');
    let un: (() => void) | undefined;
    if (isTauri) void import('../lib/platform').then((m) => m.rememberMiniPosition()).then((f) => (un = f as () => void));
    setReady(true);
    return () => un?.();
  }, []);
  return ready ? <MiniTimer standalone /> : null;
}
