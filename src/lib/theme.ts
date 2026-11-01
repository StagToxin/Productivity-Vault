import { useEffect, useState } from 'react';
import type { Prefs } from './types';

function resolve(p: Prefs, systemDark: boolean): 'dark' | 'light' {
  if (p.theme === 'dark' || p.theme === 'light') return p.theme;
  if (p.theme === 'time') {
    const h = new Date().getHours();
    return h >= p.lightFrom && h < p.lightTo ? 'light' : 'dark';
  }
  return systemDark ? 'dark' : 'light';
}

function hexToRgb(hex: string) {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function useTheme(p: Prefs) {
  const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [systemDark, setSystemDark] = useState(mq?.matches ?? true);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!mq) return;
    const f = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', f);
    const id = setInterval(() => setTick((x) => x + 1), 5 * 60_000); // 'saate göre' için
    return () => {
      mq.removeEventListener('change', f);
      clearInterval(id);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mode = resolve(p, systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.style.setProperty('--accent', p.accent);
    root.style.setProperty('--accent-rgb', hexToRgb(p.accent).join(','));
    root.lang = p.lang;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#191919' : '#f7f7f5');
  }, [mode, p.accent, p.lang]);

  return mode;
}
