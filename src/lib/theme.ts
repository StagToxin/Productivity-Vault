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

const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** a'dan b'ye t oranında karıştır */
function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Zemin renginden tüm yüzey renklerini türetir. Zemin açıksa yazılar otomatik koyu olur. */
export function surfaceVars(base: string): { mode: 'dark' | 'light'; vars: Record<string, string> } {
  const light = luminance(base) > 0.4;
  if (!light) {
    const W = '#ffffff';
    return {
      mode: 'dark',
      vars: {
        '--bg': base, '--bg-2': mix(base, W, 0.035), '--card': mix(base, W, 0.055), '--card-2': mix(base, W, 0.085),
        '--hover': mix(base, W, 0.1), '--border': mix(base, W, 0.1), '--border-2': mix(base, W, 0.16), '--cell': mix(base, W, 0.09),
      },
    };
  }
  const K = '#000000';
  return {
    mode: 'light',
    vars: {
      '--bg': base, '--bg-2': mix(base, K, 0.03), '--card': mix(base, '#ffffff', 0.75), '--card-2': mix(base, K, 0.02),
      '--hover': mix(base, K, 0.05), '--border': mix(base, K, 0.085), '--border-2': mix(base, K, 0.15), '--cell': mix(base, K, 0.075),
    },
  };
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

  const wanted = resolve(p, systemDark);
  const base = (wanted === 'dark' ? p.bgDark : p.bgLight) || (wanted === 'dark' ? '#191919' : '#f7f7f5');
  const { mode, vars } = surfaceVars(base);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.style.setProperty('--accent', p.accent);
    root.style.setProperty('--accent-rgb', hexToRgb(p.accent).join(','));
    root.lang = p.lang;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', base);
  }, [mode, base, p.accent, p.lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return mode;
}
