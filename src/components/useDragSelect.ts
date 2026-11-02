// Takvimde basılı tutup sürükleyerek seçim.
// Fare: boş alanda basıp sürükle. Dokunmatik: boş alanda ~0,35 sn basılı tut, sonra sürükle
// (böylece normal kaydırma bozulmaz). Var olan bir etkinliğin üstünden başlayan hareket seçim başlatmaz.
import { useEffect, useRef } from 'react';

export interface DragPoint {
  x: number;
  y: number;
}

interface Opts<P> {
  /** Bu hedef boş alan mı? (etkinlik/düğme üstündeyse false) */
  isEmpty: (target: EventTarget | null) => boolean;
  /** Ekran koordinatından seçim noktası (ör. gün + dakika). */
  pointAt: (p: DragPoint) => P | null;
  onStart: (p: P) => void;
  onMove: (p: P) => void;
  onEnd: (moved: boolean) => void;
}

export function useDragSelect<P>(ref: React.RefObject<HTMLElement | null>, opts: Opts<P>) {
  const o = useRef(opts);
  o.current = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = false;
    let moved = false;
    let start: DragPoint | null = null;
    let lpTimer: ReturnType<typeof setTimeout> | undefined;

    const begin = (p: DragPoint) => {
      const pt = o.current.pointAt(p);
      if (!pt) return false;
      active = true;
      moved = false;
      start = p;
      o.current.onStart(pt);
      return true;
    };
    const move = (p: DragPoint) => {
      if (!active) return;
      if (start && Math.hypot(p.x - start.x, p.y - start.y) > 4) moved = true;
      const pt = o.current.pointAt(p);
      if (pt) o.current.onMove(pt);
    };
    const end = () => {
      if (!active) return;
      active = false;
      o.current.onEnd(moved);
    };

    // ---- fare / kalem ----
    const pd = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      if (!o.current.isEmpty(e.target)) return;
      if (begin({ x: e.clientX, y: e.clientY })) e.preventDefault();
    };
    const pm = (e: PointerEvent) => e.pointerType !== 'touch' && move({ x: e.clientX, y: e.clientY });
    const pu = (e: PointerEvent) => e.pointerType !== 'touch' && end();

    // ---- dokunmatik: uzun bas ----
    let touchStart: DragPoint | null = null;
    const ts = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !o.current.isEmpty(e.target)) return;
      const t0 = e.touches[0];
      touchStart = { x: t0.clientX, y: t0.clientY };
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        if (touchStart && begin(touchStart)) navigator.vibrate?.(12);
      }, 350);
    };
    const tm = (e: TouchEvent) => {
      const t0 = e.touches[0];
      if (!t0) return;
      const p = { x: t0.clientX, y: t0.clientY };
      if (active) {
        e.preventDefault(); // seçim sırasında sayfa kaymasın
        move(p);
      } else if (touchStart && Math.hypot(p.x - touchStart.x, p.y - touchStart.y) > 8) {
        clearTimeout(lpTimer); // kaydırıyor
        touchStart = null;
      }
    };
    const te = (e: TouchEvent) => {
      clearTimeout(lpTimer);
      touchStart = null;
      if (active) {
        e.preventDefault(); // seçimden sonra "tıklama" oluşmasın
        end();
      }
    };

    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', te, { passive: false });
    el.addEventListener('touchcancel', te);
    return () => {
      clearTimeout(lpTimer);
      el.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', te);
      el.removeEventListener('touchcancel', te);
    };
  }, [ref]);
}
