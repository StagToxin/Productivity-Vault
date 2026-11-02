// Proje detayı: görevler (aktif / biten / yapılamayan), 12 aylık takvim şeridi ve Gantt planı.
import { useMemo, useState } from 'react';
import { createPlannedTasks, saveProject } from '../lib/actions';
import { addDays, addMonths, daysInMonth, diffDays, startOfMonth } from '../lib/dates';
import { useData } from '../lib/store';
import { parsePlan, schedulePlan, startOf, taskOutcome, taskProgress } from '../lib/tasks';
import type { Project, Task } from '../lib/types';
import { projectInfo, TaskRow } from './blocks';
import { openEditor } from './Editors';
import { Gantt, type Zoom } from './Gantt';
import { fmtDate } from './HabitViews';
import { Bar, Modal, Seg, Switch } from './ui';

type Tab = 'tasks' | 'calendar' | 'plan';

export function ProjectDetail({ id, tab: tab0, onClose }: { id: string; tab?: Tab; onClose: () => void }) {
  const { projects, tasks, t, today } = useData();
  const p = projects.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>(tab0 ?? 'tasks');
  if (!p) return null;
  const mine = tasks.filter((x) => x.projectId === p.id);
  const info = projectInfo(p, tasks, today);
  return (
    <Modal title={`${p.icon} ${p.name}`} onClose={onClose} wide>
      <div className="row" style={{ alignItems: 'center', marginTop: -6, marginBottom: 10 }}>
        <div className="progress-row" style={{ flex: 1, minWidth: 200 }}>
          <Bar value={info.progress} color={p.color} />
          <span className="small">
            %{Math.round(info.progress * 100)} · {info.done}/{info.total}
          </span>
        </div>
        <span className="small muted">
          {p.start ? fmtDate(p.start, t, false) : '—'} → {p.deadline ? fmtDate(p.deadline, t, false) : '—'}
          {p.status !== 'done' && info.days !== null && <b className={info.days < 0 ? 'bad' : ''}> · {info.days < 0 ? t('days_overdue', { n: -info.days }) : t('days_to_go', { n: info.days })}</b>}
        </span>
        <button className="btn sm" onClick={() => openEditor({ kind: 'project', id: p.id })}>
          {t('edit')}
        </button>
        <button className="btn sm" onClick={() => saveProject({ ...p, status: p.status === 'done' ? 'active' : 'done' })}>
          {p.status === 'done' ? t('reopen') : '✓ ' + t('mark_project_done')}
        </button>
      </div>
      <div className="chip-row">
        <Seg<Tab> value={tab} onChange={setTab} options={[{ v: 'tasks', l: '📋 ' + t('nav_tasks') }, { v: 'calendar', l: '🗓 ' + t('nav_calendar') }, { v: 'plan', l: '📐 ' + t('pd_plan') }]} />
      </div>
      {tab === 'tasks' && <TasksTab p={p} mine={mine} />}
      {tab === 'calendar' && <YearStrip p={p} mine={mine} />}
      {tab === 'plan' && <PlanTab p={p} mine={mine} />}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function TasksTab({ p, mine }: { p: Project; mine: Task[] }) {
  const { t, today } = useData();
  const [sub, setSub] = useState<'open' | 'failed' | 'done'>('open');
  const groups = {
    open: mine.filter((x) => taskOutcome(x, today) === 'open').sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9')),
    failed: mine.filter((x) => taskOutcome(x, today) === 'failed').sort((a, b) => b.dueDate!.localeCompare(a.dueDate!)),
    done: mine.filter((x) => x.status === 'done').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
  };
  const list = groups[sub];
  return (
    <>
      <div className="chip-row">
        {(['open', 'failed', 'done'] as const).map((k) => (
          <button key={k} className={'chip' + (sub === k ? ' active' : '')} onClick={() => setSub(k)}>
            {k === 'open' ? '☐ ' + t('pd_open') : k === 'failed' ? '⚠️ ' + t('pd_failed') : '☑ ' + t('pd_done')} <span className="count">{groups[k].length}</span>
          </button>
        ))}
      </div>
      {list.length ? list.map((x) => <TaskRow key={x.id} task={x} />) : <div className="empty">—</div>}
      {sub === 'failed' && list.length > 0 && <p className="small muted">{t('pd_failedHint')}</p>}
      <button className="new-row" style={{ marginTop: 8 }} onClick={() => openEditor({ kind: 'task', defaults: { projectId: p.id, dueDate: today } })}>
        ＋ {t('add_task')}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// 12 aylık şerit: her satır bir ay, ayın gün sayısı kadar kutu. Görevlerin son günleri doldurulur;
// aynı güne birden çok görev düşerse kutu renklere bölünür ve sayı gösterilir.
function YearStrip({ p, mine }: { p: Project; mine: Task[] }) {
  const { t, today, checksOf } = useData();
  const dated = mine.filter((x) => x.dueDate);
  const bounds = useMemo(() => {
    const keys = [p.start, p.deadline, ...dated.flatMap((x) => [startOf(x)!, x.dueDate!])].filter(Boolean) as string[];
    if (!keys.length) keys.push(today);
    const s = startOfMonth(keys.reduce((a, b) => (a < b ? a : b)));
    const e = startOfMonth(keys.reduce((a, b) => (a > b ? a : b)));
    let n = 1;
    while (addMonths(s, n) <= e) n++;
    return { s, n };
  }, [p.start, p.deadline, dated, today]);
  const [offset, setOffset] = useState(() => {
    // 12 aydan uzunsa bugünü içeren pencereden başla
    if (bounds.n <= 12) return 0;
    let i = 0;
    while (i < bounds.n - 12 && addMonths(bounds.s, i + 1) <= startOfMonth(today)) i++;
    return Math.max(0, Math.min(bounds.n - 12, i - 1));
  });
  const [sel, setSel] = useState<string | null>(null);
  const months = Array.from({ length: Math.min(12, bounds.n) }, (_, i) => addMonths(bounds.s, offset + i));

  const byDue = new Map<string, Task[]>();
  const inRange = new Map<string, number>();
  const checkDays = new Set<string>();
  for (const x of dated) {
    byDue.set(x.dueDate!, [...(byDue.get(x.dueDate!) ?? []), x]);
    const s = startOf(x)!;
    if (s < x.dueDate!) for (let k = s; k < x.dueDate!; k = addDays(k, 1)) inRange.set(k, (inRange.get(k) ?? 0) + 1);
    for (const c of checksOf(x.id)) checkDays.add(c.date);
  }
  const colorOf = (x: Task) => {
    const o = taskOutcome(x, today);
    return o === 'done' ? 'var(--green)' : o === 'failed' ? 'var(--red)' : p.color;
  };
  // Tek görev: durum rengi. Aynı durumda birden çok: renk koyulaşır (ısı haritası gibi).
  // Farklı durumlar çakışırsa kutu o renklere bölünür. Köşedeki sayı kaç görev olduğunu gösterir.
  const cellBg = (list: Task[]) => {
    const cols = [...new Set(list.map(colorOf))];
    if (cols.length === 1) return list.length === 1 ? cols[0] : `color-mix(in srgb, ${cols[0]}, #000 ${Math.min(50, (list.length - 1) * 20)}%)`;
    const step = 100 / cols.length;
    return `linear-gradient(135deg, ${cols.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
  };
  const selTasks = sel ? dated.filter((x) => x.dueDate === sel || (startOf(x)! <= sel && sel <= x.dueDate!)) : [];

  return (
    <div>
      {bounds.n > 12 && (
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="small muted" style={{ flex: 1 }}>
            {t('pd_monthsOf', { a: offset + 1, b: offset + months.length, n: bounds.n })}
          </span>
          <button className="btn sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 12))}>
            ‹
          </button>
          <button className="btn sm" disabled={offset + 12 >= bounds.n} onClick={() => setOffset(Math.min(bounds.n - 12, offset + 12))}>
            ›
          </button>
        </div>
      )}
      <div className="ystrip">
        <div className="ys-row ys-head">
          <span className="ys-m" />
          {Array.from({ length: 31 }, (_, i) => (
            <span key={i} className="ys-n">
              {(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}
            </span>
          ))}
        </div>
        {months.map((m) => {
          const n = daysInMonth(m);
          const mi = Number(m.slice(5, 7)) - 1;
          return (
            <div key={m} className="ys-row">
              <span className="ys-m">
                {t.months[mi].slice(0, 3)} {m.slice(2, 4)}
              </span>
              {Array.from({ length: 31 }, (_, i) => {
                if (i >= n) return <span key={i} className="ys-c out" />;
                const k = m.slice(0, 8) + String(i + 1).padStart(2, '0');
                const list = byDue.get(k);
                const span = inRange.get(k);
                const cls = 'ys-c' + (k === today ? ' today' : '') + (k === sel ? ' sel' : '') + (k === p.deadline ? ' dl' : '') + (!list && span ? ' span' : '');
                const title = `${fmtDate(k, t)}${list ? '\n' + list.map((x) => `• ${x.title} (${t(`out_${taskOutcome(x, today)}` as 'out_done')})`).join('\n') : ''}`;
                return (
                  <button
                    key={i}
                    className={cls}
                    title={title}
                    style={list ? { background: cellBg(list) } : span ? { ['--c' as string]: p.color } : undefined}
                    onClick={() => setSel(k === sel ? null : k)}
                  >
                    {list && list.length > 1 && <em>{list.length}</em>}
                    {checkDays.has(k) && <b />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="legend small muted">
        <span>
          <i style={{ background: p.color }} /> {t('out_open')}
        </span>
        <span>
          <i style={{ background: 'var(--green)' }} /> {t('out_done')}
        </span>
        <span>
          <i style={{ background: 'var(--red)' }} /> {t('out_failed')}
        </span>
        <span>
          <i style={{ background: `color-mix(in srgb, ${p.color}, #000 30%)` }} /> {t('pd_overlap')}
        </span>
        <span>
          <i style={{ background: `linear-gradient(135deg, ${p.color} 50%, var(--green) 50%)` }} /> {t('pd_overlapMixed')}
        </span>
        <span>
          <i className="span" style={{ ['--c' as string]: p.color }} /> {t('pd_spanLegend')}
        </span>
        <span>
          <i className="dotl" /> {t('pd_checkLegend')}
        </span>
      </div>
      {sel && (
        <div className="section" style={{ marginTop: 12 }}>
          <div className="section-head">
            <b style={{ flex: 1 }}>{fmtDate(sel, t)}</b>
            <button className="btn sm" onClick={() => openEditor({ kind: 'task', defaults: { projectId: p.id, dueDate: sel } })}>
              ＋ {t('add_task')}
            </button>
          </div>
          {selTasks.length ? selTasks.map((x) => <TaskRow key={x.id} task={x} />) : <div className="empty">—</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function PlanTab({ p, mine }: { p: Project; mine: Task[] }) {
  const { t } = useData();
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState<Zoom>('day');
  const [quick, setQuick] = useState(false);
  return (
    <div>
      <div className="row" style={{ marginBottom: 10, alignItems: 'center' }}>
        <Seg<Zoom> value={zoom} onChange={setZoom} options={[{ v: 'day', l: t('cal_day') }, { v: 'week', l: t('cal_week') }, { v: 'month', l: t('cal_month') }]} />
        <div style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => setQuick(!quick)}>
          ⚡ {t('qp_title')}
        </button>
        <button className={'btn sm' + (editing ? ' primary' : '')} onClick={() => setEditing(!editing)}>
          {editing ? '✓ ' + t('done_btn') : '✎ ' + t('pd_editPlan')}
        </button>
      </div>
      {editing && <p className="small muted" style={{ marginTop: -4 }}>{t('pd_editHint')}</p>}
      {quick && <QuickPlan p={p} onDone={() => setQuick(false)} />}
      {!quick && (mine.length ? <Gantt project={p} tasks={mine} editable={editing} zoom={zoom} /> : <div className="empty">{t('pd_planEmpty')}</div>)}
      {!quick && !mine.length && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
          <button className="btn primary" onClick={() => setQuick(true)}>
            ⚡ {t('qp_title')}
          </button>
          <button className="btn" onClick={() => setEditing(true)}>
            ✎ {t('pd_editPlan')}
          </button>
        </div>
      )}
      {!quick && editing && !mine.length && <Gantt project={p} tasks={[]} editable zoom={zoom} />}
    </div>
  );
}

const EXAMPLE = `# Araştırma
Literatür taraması 10g
Ara rapor !
# Geliştirme
Prototip 3hf x5
Test 15g`;

function QuickPlan({ p, onDone }: { p: Project; onDone: () => void }) {
  const { t, today } = useData();
  const [text, setText] = useState('');
  const [start, setStart] = useState(p.start ?? today);
  const [fit, setFit] = useState(false);
  const lines = useMemo(() => parsePlan(text), [text]);
  const res = useMemo(() => schedulePlan(lines, start, { end: p.deadline, fit: fit && !!p.deadline }), [lines, start, p.deadline, fit]);
  const preview: Task[] = res.items.map((it, i) => ({
    id: 'preview-' + i, title: it.title, notes: '', projectId: p.id, startDate: it.start < it.end ? it.start : undefined, dueDate: it.end,
    status: 'todo', priority: 1, createdAt: 0, updatedAt: 0, deleted: 0, dirty: 0, target: it.target, phase: it.phase, milestone: it.milestone ? 1 : undefined,
  }));
  const save = async () => {
    await createPlannedTasks(p.id, res.items);
    if (!p.start) await saveProject({ ...p, start });
    onDone();
  };
  return (
    <div className="sub-box">
      <p className="small muted" style={{ marginTop: 0 }}>{t('qp_help')}</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <textarea className="input mono" style={{ flex: 2, minWidth: 240, minHeight: 170 }} placeholder={EXAMPLE} value={text} onChange={(e) => setText(e.target.value)} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <label className="field">
            <span>{t('start_date')}</span>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          {p.deadline && (
            <div className="set-row" style={{ padding: '4px 0' }}>
              <span className="small">{t('qp_fit')}</span>
              <Switch on={fit} onChange={setFit} />
            </div>
          )}
          {!text && (
            <button className="btn sm" onClick={() => setText(EXAMPLE)}>
              {t('qp_example')}
            </button>
          )}
          {lines.length > 0 && (
            <div className="small" style={{ marginTop: 8 }}>
              {t('qp_summary', { n: lines.length, d: diffDays(res.end, start) + 1 })}
              <br />
              {start} → <b>{res.end}</b>
              {res.overflow > 0 && <div className="bad">⚠️ {t('qp_overflow', { n: res.overflow })}</div>}
            </div>
          )}
        </div>
      </div>
      {lines.length > 0 && (
        <>
          <Gantt project={{ ...p, start }} tasks={preview} editable={false} zoom={diffDays(res.end, start) > 60 ? 'week' : 'day'} preview />
          <div className="actions">
            <button className="btn" onClick={onDone}>
              {t('cancel')}
            </button>
            <button className="btn primary" onClick={save}>
              {t('qp_save', { n: lines.length })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export { taskProgress };
