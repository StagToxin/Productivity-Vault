// Proje planı (Gantt şeridi). Düzenleme modu kapalıyken salt okunur — yanlışlıkla bir şey kaymaz.
import { useMemo, useRef, useState } from 'react';
import { saveTask } from '../lib/actions';
import { addDays, diffDays, fromKey, isoWeek, range } from '../lib/dates';
import { useData } from '../lib/store';
import { isTargeted, startOf, taskOutcome, taskProgress } from '../lib/tasks';
import type { Project, Task } from '../lib/types';
import { openEditor } from './Editors';

export type Zoom = 'day' | 'week' | 'month';
const DAY_W: Record<Zoom, number> = { day: 30, week: 13, month: 5 };
const ROW = 30;
const LABEL_W = 170;

type Drag =
  | { kind: 'move' | 'start' | 'end'; id: string; x0: number; s0: string; e0: string; moved: boolean }
  | { kind: 'create'; rowKey: string; x0: number; d0: string; d1: string; taskId?: string };

export interface GanttProps {
  project: Project;
  tasks: Task[]; // projenin görevleri (önizleme görevleri de olabilir)
  editable: boolean;
  zoom: Zoom;
  preview?: boolean;
}

export function Gantt({ project, tasks, editable, zoom, preview }: GanttProps) {
  const { t, today, checksOf } = useData();
  const dayW = DAY_W[zoom];
  const [drag, setDrag] = useState<Drag | null>(null);
  const [override, setOverride] = useState<Record<string, { s: string; e: string }>>({});
  const [newTask, setNewTask] = useState<{ s: string; e: string; phase?: string; taskId?: string } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const dated = tasks.filter((x) => x.dueDate);
  const undated = tasks.filter((x) => !x.dueDate);
  const span = useMemo(() => {
    const keys = [today, project.start, project.deadline, ...dated.flatMap((x) => [startOf(x)!, x.dueDate!])].filter(Boolean) as string[];
    let s = keys.reduce((a, b) => (a < b ? a : b));
    let e = keys.reduce((a, b) => (a > b ? a : b));
    s = addDays(s, -3);
    e = addDays(e, 5);
    if (diffDays(e, s) < 35) e = addDays(s, 35);
    return { s, e, days: range(s, e) };
  }, [today, project.start, project.deadline, dated]);
  const x = (k: string) => diffDays(k, span.s) * dayW;
  const dayAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const i = Math.floor((clientX - r.left - LABEL_W) / dayW);
    return addDays(span.s, Math.max(0, Math.min(span.days.length - 1, i)));
  };
  const width = span.days.length * dayW;

  // Satırlar: aşamalara göre grupla
  const rows = useMemo(() => {
    const out: ({ type: 'phase'; name: string } | { type: 'task'; task: Task })[] = [];
    const sorted = [...dated].sort((a, b) => startOf(a)!.localeCompare(startOf(b)!) || a.dueDate!.localeCompare(b.dueDate!));
    const phases: string[] = [];
    for (const tk of sorted) if (tk.phase && !phases.includes(tk.phase)) phases.push(tk.phase);
    const noPhase = sorted.filter((tk) => !tk.phase);
    for (const tk of noPhase) out.push({ type: 'task', task: tk });
    for (const ph of phases) {
      out.push({ type: 'phase', name: ph });
      for (const tk of sorted.filter((x) => x.phase === ph)) out.push({ type: 'task', task: tk });
    }
    return out;
  }, [dated]);

  // ---- sürükleme ----
  const onBarDown = (e: React.PointerEvent, tk: Task, kind: 'move' | 'start' | 'end') => {
    if (!editable || preview) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind, id: tk.id, x0: e.clientX, s0: startOf(tk)!, e0: tk.dueDate!, moved: false });
  };
  const onTrackDown = (e: React.PointerEvent, rowKey: string, taskId?: string) => {
    if (!editable || preview || e.target !== e.currentTarget) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const d = dayAt(e.clientX);
    setDrag({ kind: 'create', rowKey, x0: e.clientX, d0: d, d1: d, taskId });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'create') {
      const d = dayAt(e.clientX);
      if (d !== drag.d1) setDrag({ ...drag, d1: d });
      return;
    }
    const dd = Math.round((e.clientX - drag.x0) / dayW);
    if (!dd && !drag.moved) return;
    let s = drag.s0;
    let en = drag.e0;
    if (drag.kind === 'move') {
      s = addDays(drag.s0, dd);
      en = addDays(drag.e0, dd);
    } else if (drag.kind === 'start') {
      s = addDays(drag.s0, dd);
      if (s > en) s = en;
    } else {
      en = addDays(drag.e0, dd);
      if (en < s) en = s;
    }
    if (!drag.moved) setDrag({ ...drag, moved: true });
    setOverride((o) => ({ ...o, [drag.id]: { s, e: en } }));
  };
  const onUp = async () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.kind === 'create') {
      const [s, en] = d.d0 < d.d1 ? [d.d0, d.d1] : [d.d1, d.d0];
      if (d.taskId) {
        const tk = tasks.find((x) => x.id === d.taskId)!;
        await saveTask({ ...tk, startDate: s < en ? s : undefined, dueDate: en });
      } else setNewTask({ s, e: en, phase: d.rowKey.startsWith('phase:') ? d.rowKey.slice(6) : undefined });
      return;
    }
    const tk = tasks.find((x) => x.id === d.id);
    if (!tk) return;
    if (!d.moved) {
      openEditor({ kind: 'task', id: tk.id });
      return;
    }
    const o = override[d.id];
    if (o) await saveTask({ ...tk, startDate: o.s < o.e ? o.s : undefined, dueDate: o.e });
    setOverride((x) => {
      const n = { ...x };
      delete n[d.id];
      return n;
    });
  };

  // ---- başlık ----
  const months: { k: string; n: number }[] = [];
  for (const k of span.days) {
    const m = k.slice(0, 7);
    if (months.length && months[months.length - 1].k === m) months[months.length - 1].n++;
    else months.push({ k: m, n: 1 });
  }

  const bar = (tk: Task) => {
    const o = override[tk.id];
    const s = o?.s ?? startOf(tk)!;
    const e = o?.e ?? tk.dueDate!;
    const mine = checksOf(tk.id);
    const p = taskProgress(tk, mine);
    const out = taskOutcome(tk, today);
    const color = out === 'done' ? 'var(--green)' : out === 'failed' ? 'var(--red)' : project.color;
    const left = x(s);
    const w = (diffDays(e, s) + 1) * dayW;
    if (tk.milestone)
      return (
        <div
          className={'gn-ms' + (editable && !preview ? ' ed' : '')}
          style={{ left: left + dayW / 2 - 8, ['--c' as string]: color }}
          title={`◆ ${tk.title} · ${e}`}
          onPointerDown={(ev) => onBarDown(ev, tk, 'move')}
          onClick={() => !editable && !preview && openEditor({ kind: 'task', id: tk.id })}
        />
      );
    return (
      <div
        className={'gn-bar' + (out === 'done' ? ' done' : '') + (out === 'failed' ? ' failed' : '') + (preview ? ' preview' : '') + (editable && !preview ? ' ed' : '')}
        style={{ left, width: Math.max(dayW, w), ['--c' as string]: color }}
        title={`${tk.title} · ${s === e ? e : `${s} → ${e}`}${isTargeted(tk) ? ` · ${p.count}/${p.target}` : ''}`}
        onPointerDown={(ev) => onBarDown(ev, tk, 'move')}
        onClick={() => !editable && !preview && openEditor({ kind: 'task', id: tk.id })}
      >
        {(isTargeted(tk) || tk.checklist?.length) && <i className="gn-fill" style={{ width: `${p.pct * 100}%` }} />}
        {w > 46 && <span className="gn-lbl">{tk.title}</span>}
        {mine.map((c) => (
          <b key={c.id} className="gn-dot" style={{ left: x(c.date) - left + dayW / 2 - 3 }} />
        ))}
        {editable && !preview && (
          <>
            <span className="gn-h l" onPointerDown={(ev) => onBarDown(ev, tk, 'start')} />
            <span className="gn-h r" onPointerDown={(ev) => onBarDown(ev, tk, 'end')} />
          </>
        )}
      </div>
    );
  };

  const createGhost = (rowKey: string) =>
    drag?.kind === 'create' && drag.rowKey === rowKey ? (
      <div className="gn-ghost" style={{ left: x(drag.d0 < drag.d1 ? drag.d0 : drag.d1), width: (Math.abs(diffDays(drag.d1, drag.d0)) + 1) * dayW }} />
    ) : null;

  const todayX = x(today) + dayW / 2;
  const weekends = zoom !== 'month' ? span.days.map((k, i) => (fromKey(k).getDay() % 6 === 0 ? i : -1)).filter((i) => i >= 0) : [];

  return (
    <div className={'gantt' + (editable ? ' editing' : '')} ref={trackRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
      <div style={{ width: LABEL_W + width, position: 'relative' }}>
        {/* başlık */}
        <div className="gn-row gn-head">
          <div className="gn-label" />
          <div className="gn-track" style={{ width }}>
            {months.map((m) => (
              <span key={m.k} className="gn-month" style={{ width: m.n * dayW }}>
                {m.n * dayW > 40 ? `${t.months[Number(m.k.slice(5)) - 1].slice(0, zoom === 'month' ? 3 : 20)} ${m.k.slice(2, 4)}` : ''}
              </span>
            ))}
          </div>
        </div>
        {zoom !== 'month' && (
          <div className="gn-row gn-head2">
            <div className="gn-label" />
            <div className="gn-track" style={{ width }}>
              {span.days.map((k, i) =>
                zoom === 'day' ? (
                  <span key={k} className={'gn-d' + (k === today ? ' today' : '')} style={{ left: i * dayW, width: dayW }}>
                    {fromKey(k).getDate()}
                  </span>
                ) : fromKey(k).getDay() === 1 ? (
                  <span key={k} className="gn-d" style={{ left: i * dayW, width: dayW * 7, textAlign: 'left' }}>
                    {t('week_short')}
                    {isoWeek(k)}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        )}
        {/* satırlar */}
        <div className="gn-body">
          {weekends.map((i) => (
            <i key={i} className="gn-we" style={{ left: LABEL_W + i * dayW, width: dayW }} />
          ))}
          {project.deadline && <i className="gn-deadline" style={{ left: LABEL_W + x(project.deadline) + dayW }} title={t('deadline')} />}
          <i className="gn-today" style={{ left: LABEL_W + todayX }} />
          {rows.map((r, i) =>
            r.type === 'phase' ? (
              <div key={'p' + r.name + i} className="gn-row gn-phase">
                <div className="gn-label">▸ {r.name}</div>
                <div className="gn-track" style={{ width }} onPointerDown={(e) => onTrackDown(e, 'phase:' + r.name)}>
                  {createGhost('phase:' + r.name)}
                </div>
              </div>
            ) : (
              <div key={r.task.id} className="gn-row">
                <div className={'gn-label' + (r.task.status === 'done' ? ' done' : '')} onClick={() => !preview && openEditor({ kind: 'task', id: r.task.id })}>
                  {r.task.milestone ? '◆ ' : ''}
                  {r.task.title}
                </div>
                <div className="gn-track" style={{ width }}>
                  {bar(r.task)}
                </div>
              </div>
            ),
          )}
          {!preview &&
            undated.map((tk) => (
              <div key={tk.id} className="gn-row">
                <div className="gn-label muted" onClick={() => openEditor({ kind: 'task', id: tk.id })}>
                  {tk.title} <span className="small">({t('no_due')})</span>
                </div>
                <div className="gn-track" style={{ width }} onPointerDown={(e) => onTrackDown(e, 'u:' + tk.id, tk.id)}>
                  {createGhost('u:' + tk.id)}
                </div>
              </div>
            ))}
          {editable && !preview && (
            <div className="gn-row gn-new">
              <div className="gn-label muted">＋ {t('gn_dragNew')}</div>
              <div className="gn-track" style={{ width }} onPointerDown={(e) => onTrackDown(e, 'new')}>
                {createGhost('new')}
              </div>
            </div>
          )}
        </div>
      </div>
      {newTask && <NewTaskPopover project={project} s={newTask.s} e={newTask.e} phase={newTask.phase} onClose={() => setNewTask(null)} />}
    </div>
  );
}

function NewTaskPopover({ project, s, e, phase, onClose }: { project: Project; s: string; e: string; phase?: string; onClose: () => void }) {
  const { t } = useData();
  const [title, setTitle] = useState('');
  const save = async () => {
    if (!title.trim()) return onClose();
    await saveTask({ title: title.trim(), projectId: project.id, startDate: s < e ? s : undefined, dueDate: e, phase });
    onClose();
  };
  return (
    <div className="gn-pop" onPointerDown={(ev) => ev.stopPropagation()}>
      <div className="small muted">
        {s === e ? s : `${s} → ${e} (${diffDays(e, s) + 1} ${t('day_unit')})`}
        {phase ? ` · ${phase}` : ''}
      </div>
      <form onSubmit={(ev) => (ev.preventDefault(), void save())} className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input" autoFocus placeholder={t('title')} value={title} onChange={(ev) => setTitle(ev.target.value)} onKeyDown={(ev) => ev.key === 'Escape' && onClose()} />
        <button className="btn primary sm">{t('save')}</button>
        <button type="button" className="btn sm" onClick={onClose}>
          ✕
        </button>
      </form>
    </div>
  );
}

export const GANTT_ROW = ROW;
