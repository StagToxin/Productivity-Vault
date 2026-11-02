import { isValidElement, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { EMOJIS } from '../lib/actions';

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="✕" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  // Düğme grubu (Seg) içeren alanlar <label> olmamalı: etikete tıklamak ilk düğmeye basmış sayılıyordu.
  if (isValidElement(children) && children.type === Seg)
    return (
      <div className="field" role="group" aria-label={label}>
        <span>{label}</span>
        {children}
      </div>
    );
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" aria-label={label} aria-pressed={on} className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)} />;
}

export function Seg<V extends string | number>({ value, options, onChange }: { value: V; options: { v: V; l: string }[]; onChange: (v: V) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button type="button" key={String(o.v)} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Swatches({ value, colors, onChange }: { value: string; colors: string[]; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button type="button" key={c} aria-label={c} className={'swatch' + (c === value ? ' on' : '')} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 30, height: 28, border: 0, background: 'none', padding: 0 }} />
    </div>
  );
}

export function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div className="emoji-grid">
      {EMOJIS.map((e) => (
        <button type="button" key={e} className={e === value ? 'on' : ''} onClick={() => onChange(e)}>
          {e}
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="bar">
      <i style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: color }} />
    </div>
  );
}

// ---------- Toast & kutlama ----------
interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
let toasts: ToastItem[] = [];
let celebration: { icon: string; text: string } | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let nextId = 1;

export function toast(text: string, action?: ToastItem['action'], ms = 3500) {
  const id = nextId++;
  toasts = [...toasts, { id, text, action }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, ms);
}

export function celebrate(icon: string, text: string) {
  celebration = { icon, text };
  emit();
  setTimeout(() => {
    celebration = null;
    emit();
  }, 2600);
}

const snap = () => ({ toasts, celebration });
let last = snap();
function getSnap() {
  if (last.toasts !== toasts || last.celebration !== celebration) last = snap();
  return last;
}

export function Toaster() {
  const s = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), getSnap);
  return (
    <>
      <div className="toasts">
        {s.toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.text}</span>
            {t.action && (
              <button className="btn sm" onClick={t.action.run}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      {s.celebration && (
        <div
          className="celebrate"
          onClick={() => {
            celebration = null;
            emit();
          }}
        >
          <div className="box">
            <div className="big">{s.celebration.icon}</div>
            <h2>{s.celebration.text}</h2>
          </div>
        </div>
      )}
    </>
  );
}

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}
