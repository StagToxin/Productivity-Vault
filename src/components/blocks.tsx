import { useMemo, useState } from 'react';
import { setTaskStatus, toggleHabit } from '../lib/actions';
import { addDays, addMonths, daysInMonth, diffDays, fromKey, range, startOfMonth, startOfWeek, weekdayIndex } from '../lib/dates';
import { habitStats, XP } from '../lib/logic';
import { useData } from '../lib/store';
import type { Habit, Project, Task } from '../lib/types';
import { openEditor } from './Editors';
import { Bar, toast } from './ui';

// ---------- Alışkanlık: seri & hedef kartı ----------
export function HabitCard({ h }: { h: Habit }) {
  const { logs, today, t, prefs } = useData();
  const s = useMemo(() => habitStats(h, logs, today, prefs.weekStartsMonday), [h, logs, today, prefs.weekStartsMonday]);
  const first = startOfMonth(today);
  const lead = weekdayIndex(first, prefs.weekStartsMonday);
  const n = daysInMonth(today);
  return (
    <div className="card">
      <div className="card-title clickable" onClick={() => openEditor({ kind: 'habit', id: h.id })} style={{ cursor: 'pointer' }}>
        <span>{h.icon}</span>
        <span className="t">{h.name}</span>
      </div>
      <div className="meta">🎯 {t('weekly_x', { n: h.weeklyTarget })}</div>
      <div className="mini-month">
        {Array.from({ length: lead }, (_, i) => (
          <div key={'b' + i} className="c blank" />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const k = first.slice(0, 8) + String(i + 1).padStart(2, '0');
          const on = s.doneDates.has(k);
          return (
            <div key={k} className={'c' + (on ? ' on' : '') + (k === today ? ' today' : '') + (k > today ? ' future' : '')} style={on ? { background: h.color } : undefined}>
              {i + 1}
            </div>
          );
        })}
      </div>
      <div className={s.doneToday ? 'ok' : 'small muted'} style={s.doneToday ? { color: h.color } : undefined}>
        {s.doneToday ? '✓ ' + t('completed_today') : '○ ' + t('not_completed')}
      </div>
      <div className="progress-row">
        <span>{t('progress')}</span>
        <Bar value={s.weekProgress} color={h.color} />
        <span className="small">{Math.round(s.weekProgress * 100)}% ({s.weekCount}/{h.weeklyTarget})</span>
      </div>
      <div className="meta">
        {t('streak')} 🔥 {s.streak} {t(s.unit === 'day' ? 'day_unit' : 'week_unit')} | {t('max')}: {s.maxStreak} {t(s.unit === 'day' ? 'day_unit' : 'week_unit')}
      </div>
      <MarkButton habit={h} done={s.doneToday} />
    </div>
  );
}

export function MarkButton({ habit, done }: { habit: Habit; done: boolean }) {
  const { t } = useData();
  return (
    <button
      className={'mark-btn' + (done ? ' on' : '')}
      onClick={async () => {
        const nowDone = await toggleHabit(habit.id);
        if (nowDone) toast(`${habit.icon} +${XP.habit} XP`);
      }}
    >
      {done ? '✓ ' + t('completed_today') : t('mark_complete')}
    </button>
  );
}

// ---------- Alışkanlık: haftalık ızgara (satır = gün, sütun = hafta) ----------
export function HabitGridCard({ h, weeks = 9 }: { h: Habit; weeks?: number }) {
  const { logs, today, t, prefs } = useData();
  const s = useMemo(() => habitStats(h, logs, today, prefs.weekStartsMonday), [h, logs, today, prefs.weekStartsMonday]);
  const curWeek = startOfWeek(today, prefs.weekStartsMonday);
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(curWeek, -7 * (weeks - 1 - i)));
  const dow = prefs.weekStartsMonday ? t.dow : [t.dow[6], ...t.dow.slice(0, 6)];
  return (
    <div className="card">
      <div className="card-title">
        <span>{h.icon}</span>
        <span className="t">{h.name}</span>
      </div>
      <div className={s.doneToday ? 'ok' : 'small muted'} style={s.doneToday ? { color: h.color } : undefined}>
        {s.doneToday ? '✓ ' + t('completed_today') : '○ ' + t('not_completed')}
      </div>
      <div className="meta">
        📅 {t('today_is')}: {fromKey(today).getDate()}/{t.months[fromKey(today).getMonth()]}/{today.slice(0, 4)}
      </div>
      <div className="week-grid" style={{ gridTemplateColumns: `22px repeat(${weeks}, 1fr)` }}>
        {dow.map((d, row) => (
          <Row key={d} label={d}>
            {weekStarts.map((ws) => {
              const k = addDays(ws, row);
              const on = s.doneDates.has(k);
              const future = k > today;
              return (
                <button
                  key={k}
                  title={k}
                  disabled={future}
                  className={'c' + (k === today ? ' today' : '') + (future ? ' future' : '')}
                  style={on ? { background: h.color } : undefined}
                  onClick={() => toggleHabit(h.id, k)}
                />
              );
            })}
          </Row>
        ))}
      </div>
      <div className="progress-row">
        <span>{t('progress')}</span>
        <Bar value={s.weekProgress} color={h.color} />
        <span className="small">{Math.round(s.weekProgress * 100)}%</span>
      </div>
      <div className="meta">
        {t('streak')} 🔥 {s.streak} {t(s.unit === 'day' ? 'day_unit' : 'week_unit')} | {t('max')}: {s.maxStreak}
      </div>
      <MarkButton habit={h} done={s.doneToday} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="lbl">{label}</div>
      {children}
    </>
  );
}

// ---------- Görev ----------
export function dueInfo(task: Task, today: string, t: ReturnType<typeof useData>['t']) {
  if (!task.dueDate) return { text: t('no_due'), cls: 'muted' };
  const d = diffDays(task.dueDate, today);
  if (task.status === 'done') return { text: task.dueDate, cls: 'muted' };
  if (d === 0) return { text: '📅 ' + t('due_today'), cls: '' };
  if (d < 0) return { text: '⚠️ ' + t('overdue_by', { n: -d }), cls: 'bad' };
  return { text: '📅 ' + t('due_in', { n: d }), cls: 'muted' };
}

export function statusBadge(task: Task, t: ReturnType<typeof useData>['t']) {
  if (task.status === 'done') return <span className="badge green">● {t('done')}</span>;
  if (task.status === 'doing') return <span className="badge blue">● {t('in_progress')}</span>;
  return <span className="badge red">● {t('not_started')}</span>;
}

export function TaskCard({ task }: { task: Task }) {
  const { projects, today, t } = useData();
  const p = projects.find((x) => x.id === task.projectId);
  const due = dueInfo(task, today, t);
  return (
    <div className="card clickable" onClick={() => openEditor({ kind: 'task', id: task.id })}>
      <div className="card-title">
        <span>📄</span>
        <span className="t">{task.title}</span>
      </div>
      {p && <div className="meta">📌 {p.name}</div>}
      <div>{statusBadge(task, t)}</div>
      <div className={'meta ' + due.cls}>{due.text}</div>
      <CompleteButton task={task} />
    </div>
  );
}

export function CompleteButton({ task }: { task: Task }) {
  const { t } = useData();
  const done = task.status === 'done';
  return (
    <button
      className={'mark-btn' + (done ? ' on' : '')}
      onClick={async (e) => {
        e.stopPropagation();
        await setTaskStatus(task.id, done ? 'todo' : 'done');
        if (!done) toast(`✅ +${XP.task[task.priority]} XP`, { label: t('undo'), run: () => setTaskStatus(task.id, 'todo') });
      }}
    >
      {done ? '✓ ' + t('done') : t('mark_done')}
    </button>
  );
}

export function TaskRow({ task }: { task: Task }) {
  const { projects, today, t } = useData();
  const p = projects.find((x) => x.id === task.projectId);
  const due = dueInfo(task, today, t);
  const done = task.status === 'done';
  return (
    <div className={'task-row' + (done ? ' done' : '')}>
      <button
        className={'check round' + (done ? ' on' : '')}
        aria-label={t('mark_done')}
        onClick={async () => {
          await setTaskStatus(task.id, done ? 'todo' : 'done');
          if (!done) toast(`✅ +${XP.task[task.priority]} XP`, { label: t('undo'), run: () => setTaskStatus(task.id, 'todo') });
        }}
      >
        {done ? '✓' : ''}
      </button>
      <div className="t clickable" style={{ cursor: 'pointer' }} onClick={() => openEditor({ kind: 'task', id: task.id })}>
        <div className="title">
          {task.priority === 2 && <span className="bad">❗ </span>}
          {task.title}
        </div>
        <div className="meta">
          {p && (
            <span>
              {p.icon} {p.name}
            </span>
          )}
          <span className={due.cls}>{due.text}</span>
          {task.reminderAt && <span>🔔</span>}
        </div>
      </div>
      {statusBadge(task, t)}
    </div>
  );
}

export type TaskTab = 'today' | 'yesterday' | 'overdue' | 'upcoming' | 'unrelated' | 'inbox' | 'completed' | 'all';

export function filterTasks(tasks: Task[], tab: TaskTab, today: string): Task[] {
  const open = tasks.filter((t) => t.status !== 'done');
  const byDue = (a: Task, b: Task) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.priority - a.priority;
  switch (tab) {
    case 'today':
      return open.filter((t) => t.dueDate === today).sort(byDue);
    case 'yesterday':
      return tasks.filter((t) => t.dueDate === addDays(today, -1)).sort(byDue);
    case 'overdue':
      return open.filter((t) => t.dueDate && t.dueDate < today).sort(byDue);
    case 'upcoming':
      return open.filter((t) => t.dueDate && t.dueDate > today).sort(byDue);
    case 'unrelated':
      return open.filter((t) => !t.projectId).sort(byDue);
    case 'inbox':
      return open.filter((t) => !t.dueDate).sort((a, b) => b.createdAt - a.createdAt);
    case 'completed':
      return tasks.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    default:
      return [...tasks].sort(byDue);
  }
}

// ---------- Proje ----------
export function projectInfo(p: Project, tasks: Task[], today: string) {
  const related = tasks.filter((t) => t.projectId === p.id);
  const done = related.filter((t) => t.status === 'done').length;
  const d = p.deadline ? diffDays(p.deadline, today) : null;
  return { total: related.length, done, open: related.length - done, days: d, progress: related.length ? done / related.length : 0 };
}

export function ProjectCard({ p }: { p: Project }) {
  const { tasks, today, t } = useData();
  const i = projectInfo(p, tasks, today);
  return (
    <div className="card clickable" onClick={() => openEditor({ kind: 'project', id: p.id })}>
      <div className="card-title">
        <span>{p.icon}</span>
        <span className="t">{p.name}</span>
      </div>
      <div className="meta">
        🗂 {t('related_tasks')} = {i.total}
      </div>
      <hr className="sep" />
      <div className="meta">
        ☐ {t('incomplete_tasks')}: {i.open}
      </div>
      <div className="meta">
        ☑ {t('completed_tasks')}: {i.done}
      </div>
      <div className="progress-row">
        <Bar value={i.progress} color={p.color} />
        <span className="small">{Math.round(i.progress * 100)}%</span>
      </div>
      {p.status === 'done' ? (
        <span className="badge green">✓ {t('done')}</span>
      ) : i.days !== null ? (
        <div className={'meta ' + (i.days < 0 ? 'bad' : '')}>📅 {i.days < 0 ? t('days_overdue', { n: -i.days }) : t('days_to_go', { n: i.days })}</div>
      ) : null}
    </div>
  );
}

// ---------- Takvim ----------
export function CalendarView({ mode, anchor }: { mode: 'week' | 'month'; anchor: string }) {
  const { tasks, logs, habits, today, t, prefs, projects } = useData();
  const monday = prefs.weekStartsMonday;
  let days: string[];
  if (mode === 'week') {
    const ws = startOfWeek(anchor, monday);
    days = range(ws, addDays(ws, 6));
  } else {
    const first = startOfMonth(anchor);
    const ws = startOfWeek(first, monday);
    const last = addDays(addMonths(first, 1), -1);
    const we = addDays(startOfWeek(last, monday), 6);
    days = range(ws, we);
  }
  const dow = monday ? t.dow : [t.dow[6], ...t.dow.slice(0, 6)];
  const month = anchor.slice(0, 7);
  const habitColor = new Map(habits.map((h) => [h.id, h.color]));
  const projColor = new Map(projects.map((p) => [p.id, p.color]));
  return (
    <div className="cal">
      {dow.map((d) => (
        <div key={d} className="h">
          {d}
        </div>
      ))}
      {days.map((k) => {
        const dayTasks = tasks.filter((x) => x.dueDate === k);
        const dayLogs = logs.filter((l) => l.date === k && l.done && habitColor.has(l.habitId));
        return (
          <div key={k} className={'day' + (k === today ? ' today' : '') + (mode === 'month' && !k.startsWith(month) ? ' other' : '')} style={mode === 'week' ? { minHeight: 140 } : undefined}>
            <div className="n">
              <button className="icon-btn add" aria-label={t('add_task')} onClick={() => openEditor({ kind: 'task', defaults: { dueDate: k } })}>
                +
              </button>
              <b>{fromKey(k).getDate()}</b>
            </div>
            {dayLogs.length > 0 && (
              <div className="dots">
                {dayLogs.map((l) => (
                  <i key={l.id} style={{ background: habitColor.get(l.habitId) }} />
                ))}
              </div>
            )}
            {dayTasks.slice(0, mode === 'week' ? 8 : 3).map((x) => (
              <div
                key={x.id}
                className={'ev' + (x.status === 'done' ? ' done' : '')}
                style={{ borderLeftColor: (x.projectId && projColor.get(x.projectId)) || undefined }}
                onClick={() => openEditor({ kind: 'task', id: x.id })}
                title={x.title}
              >
                {x.title}
              </div>
            ))}
            {dayTasks.length > (mode === 'week' ? 8 : 3) && <div className="small muted">+{dayTasks.length - (mode === 'week' ? 8 : 3)}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function CalendarNav({ mode, anchor, setAnchor }: { mode: 'week' | 'month'; anchor: string; setAnchor: (k: string) => void }) {
  const { t, today } = useData();
  const d = fromKey(anchor);
  return (
    <div className="row" style={{ marginBottom: 10 }}>
      <b style={{ flex: 1 }}>
        {t.months[d.getMonth()]} {d.getFullYear()}
      </b>
      <button className="btn sm" onClick={() => setAnchor(mode === 'week' ? addDays(anchor, -7) : addMonths(anchor, -1))}>
        ‹
      </button>
      <button className="btn sm" onClick={() => setAnchor(today)}>
        {t('today')}
      </button>
      <button className="btn sm" onClick={() => setAnchor(mode === 'week' ? addDays(anchor, 7) : addMonths(anchor, 1))}>
        ›
      </button>
    </div>
  );
}

export function useCalendarState() {
  const { today } = useData();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(today);
  return { mode, setMode, anchor, setAnchor };
}
