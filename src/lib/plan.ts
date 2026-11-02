// Odak planı üretici (saf): toplam süreyi derslere böler, araya kısa/uzun molaları yerleştirir.
import type { FocusPlan } from './types';

export type SegKind = 'focus' | 'short' | 'long';
export interface Seg {
  kind: SegKind;
  min: number;
}

export const BLOCK_MIN = 20;
export const BLOCK_MAX = 60;

export function defaultPlan(p: { focusMinutes?: number; shortBreak?: number; longBreak?: number } = {}): FocusPlan {
  return {
    id: 'quick',
    name: '',
    totalMin: 120,
    countBreaks: false,
    blockMin: clamp(p.focusMinutes ?? 45, BLOCK_MIN, BLOCK_MAX),
    shortBreak: p.shortBreak ?? 10,
    longBreak: p.longBreak ?? 25,
    longEvery: 3,
    noBreaks: false,
    equalize: true,
    autoNext: true,
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** n parçaya mümkün olduğunca eşit tamsayı dakika dağıt. */
function split(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

function breaksAfter(i: number, n: number, p: FocusPlan): Seg | null {
  if (i >= n - 1) return null; // son dersten sonra mola yok
  if (p.longBreak > 0 && p.longEvery > 0 && (i + 1) % p.longEvery === 0) return { kind: 'long', min: p.longBreak };
  if (p.shortBreak > 0) return { kind: 'short', min: p.shortBreak };
  return null;
}

function breakTotal(n: number, p: FocusPlan): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += breaksAfter(i, n, p)?.min ?? 0;
  return s;
}

/** Çalışma süresini derslere böl. */
function blocksFor(study: number, p: FocusPlan): number[] {
  const want = clamp(p.blockMin, BLOCK_MIN, BLOCK_MAX);
  if (study <= 0) return [];
  if (study <= BLOCK_MAX && study <= want * 1.25) return [study];
  if (p.equalize) {
    let n = Math.max(1, Math.round(study / want));
    while (study / n > BLOCK_MAX) n++;
    while (n > 1 && study / n < BLOCK_MIN) n--;
    return split(study, n);
  }
  const n = Math.floor(study / want);
  const rest = study - n * want;
  const out = Array.from({ length: n }, () => want);
  if (rest >= 10 || out.length === 0) out.push(rest);
  else out[out.length - 1] += rest;
  return out;
}

export function buildPlan(p: FocusPlan): Seg[] {
  const total = Math.max(1, Math.round(p.totalMin));
  if (p.noBreaks) return [{ kind: 'focus', min: total }];
  let blocks: number[];
  if (!p.countBreaks) {
    blocks = blocksFor(total, p);
  } else {
    // Molalar dahil: ders sayısını, dersler istenen süreye en yakın olacak şekilde seç.
    let best: number[] = [total];
    let bestScore = Infinity;
    for (let n = 1; n <= 24; n++) {
      const study = total - breakTotal(n, p);
      if (study < n * 5) break;
      const per = study / n;
      const out = per < BLOCK_MIN || per > BLOCK_MAX ? 1000 : 0;
      const score = out + Math.abs(per - p.blockMin);
      if (score < bestScore) {
        bestScore = score;
        best = p.equalize ? split(study, n) : (() => {
          const w = Math.min(p.blockMin, Math.floor(study / n));
          const arr = Array.from({ length: n }, () => w);
          arr[n - 1] += study - w * n;
          return arr;
        })();
      }
    }
    blocks = best;
  }
  const segs: Seg[] = [];
  blocks.forEach((m, i) => {
    segs.push({ kind: 'focus', min: m });
    const b = breaksAfter(i, blocks.length, p);
    if (b) segs.push(b);
  });
  return segs;
}

export function planTotals(segs: Seg[]) {
  const focus = segs.filter((s) => s.kind === 'focus').reduce((a, s) => a + s.min, 0);
  const all = segs.reduce((a, s) => a + s.min, 0);
  return { focus, breaks: all - focus, all, blocks: segs.filter((s) => s.kind === 'focus').length };
}
