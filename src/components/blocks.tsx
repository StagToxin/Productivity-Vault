import { useMemo, useState } from 'react';
import { checkNextSlot, setTaskStatus, toggleHabit } from '../lib/actions';
import { addDays, addMonths, daysInMonth, diffDays, fromKey, keyOfTs, startOfMonth, startOfWeek, timeOfTs, weekdayIndex } from '../lib/dates';
import { effectiveTarget, habitStats, isScheduled, isSlotted, XP, type DayInfo } from '../lib/logic';
import { useData } from '../lib/store';
import type { Habit, Project, Task } from '../lib/types';
import { openEditor } from './Editors';
import { Bar, toast } from './ui';
import { Checklist, PaceBadge, TaskCheckButton, TaskProgressLine, TaskTags } from './TaskBits';
import { isTargeted, onDay, startOf } from '../lib/tasks';

/** Gün hücresinin rengi: tamamlandıysa tam renk, kısmi ise ilerlemeye göre saydam. */
export function cellStyle(h: Habit, d: DayInfo | undefined): React.CSSProperties | undefined {
  if (!d || d.count === 0) return undefined;
  if (d.complete) return { background: h.color };
  const a = Math.round((0.22 + 0.5 * (d.count / d.total)) * 255).toString(16).padStart(2, '0');
  return { background: h.color + a };
}

export function useHabitStats(h: Habit) {
  const { idxOf, today, prefs } = useData();
  const idx = idxOf(h.id);
  return { idx, s: useMemo(() => habitStats(h, idx, today, prefs.weekStartsMonday), [h, idx, today, prefs.weekStartsMonday]) };
}

function targetLabel(h: Habit, t: ReturnType<typeof useData>['t'], prefs: ReturnType<typeof useData>['prefs']) {
  if (h.days?.length) {
    const dow = t.dow;
    return h.days.map((d) => dow[d]).join(' · ');
  }
  return t('weekly_x', { n: effectiveTarget(h) });
}

// ---------- Alışkanlık: seri & hedef kartı ----------
export function HabitCard({ h }: { h: Habit }) {
  const { today, t, prefs } = useData();
  const { idx, s } = useHabitStats(h);
  const [month, setMonth] = useState(startOfMonth(today));
  const lead = weekdayIndex(month, prefs.weekStartsMonday);
  const n = daysInMonth(month);
  const m = fromKey(month);
  const slotted = isSlotted(h);
  return (
    <div className="card">
      <button className="card-title link-title" onClick={() => openEditor({ kind: 'habitDetail', id: h.id })}>
        <span>{h.icon}</span>
        <span className="t">{h.name}</span>
        {h.share && (
          <span className="badge accent" title={t('shared_badge')}>
            👥
          </span>
        )}
      </button>
      <div className="meta">
        🎯 {targetLabel(h, t, prefs)}
        {slotted && <span className="badge">×{h.slots!.length}/{t('day_unit')}</span>}
      </div>
      <div className="month-nav">
        <button className="icon-btn" aria-label="‹" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <span className="small muted">{t.months[m.getMonth()]} {m.getFullYear()}</span>
        <button className="icon-btn" aria-label="›" disabled={month >= startOfMonth(today)} onClick={() => setMonth(addMonths(month, 1))}>›</button>
      </div>
      <div className="mini-month">
        {Array.from({ length: lead }, (_, i) => (
          <div key={'b' + i} className="c blank" />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const k = month.slice(0, 8) + String(i + 1).padStart(2, '0');
          const d = idx.get(k);
          const st = cellStyle(h, d);
          return (
            <div key={k} title={d && slotted ? `${d.count}/${d.total}` : k} className={'c' + (st ? ' on' : '') + (k === today ? ' today' : '') + (k > today ? ' future' : '') + (isScheduled(h, k) ? '' : ' off')} style={st}>
              {i + 1}
            </div>
          );
        })}
      </div>
      {slotted ? (
        <SlotChecklist h={h} date={today} compact />
      ) : (
        <div className={s.doneToday ? 'ok' : 'small muted'} style={s.doneToday ? { color: h.color } : undefined}>
          {s.doneToday ? '✓ ' + t('completed_today') + (idx.get(today)?.at ? ` · ${timeOfTs(idx.get(today)!.at!)}` : '') : '○ ' + t('not_completed')}
        </div>
      )}
      <div className="progress-row">
        <span>{t('progress')}</span>
        <Bar value={s.weekProgress} color={h.color} />
        <span className="small">{Math.round(s.weekProgress * 100)}% ({s.weekCount}/{effectiveTarget(h)})</span>
      </div>
      <div className="meta">
        {t('streak')} 🔥 {s.streak} {t(s.unit === 'day' ? 'day_unit' : 'week_unit')} | {t('max')}: {s.maxStreak} {t(s.unit === 'day' ? 'day_unit' : 'week_unit')}
      </div>
      <MarkButton habit={h} done={s.doneToday} count={s.todayCount} total={s.todayTotal} />
    </div>
  );
}

export function MarkButton({ habit, done, count = 0, total = 1 }: { habit: Habit; done: boolean; count?: number; total?: number }) {
  const { t, today } = useData();
  if (isSlotted(habit)) {
    return (
      <button
        className={'mark-btn' + (done ? ' on' : '')}
        onClick={async () => {
          if (done) return openEditor({ kind: 'habitDay', id: habit.id, date: today });
          const sl = await checkNextSlot(habit);
          if (sl) toast(`${habit.icon} ${sl.name} ✓ +${XP.slot} XP`);
        }}
      >
        {done ? `✓ ${t('all_done')} (${count}/${total})` : `${t('mark_next')} (${count}/${total})`}
      </button>
    );
  }
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

/** Bölümlü alışkanlığın bir günündeki bölümler: tıkla → onayla / geri al. Onay saati görünür. */
export function SlotChecklist({ h, date, compact = false }: { h: Habit; date: string; compact?: boolean }) {
  const { idxOf, today } = useData();
  const d = idxOf(h.id).get(date);
  const nowHm = timeOfTs(Date.now());
  return (
    <div className={'slots' + (compact ? ' compact' : '')}>
      {h.slots!.map((sl) => {
        const done = d?.slots.has(sl.id);
        const at = d?.slots.get(sl.id);
        const late = at && keyOfTs(at) !== date;
        const overdue = !done && (date < today || (date === today && sl.time && sl.time < nowHm));
        return (
          <button
            key={sl.id}
            className={'slot' + (done ? ' on' : '') + (overdue ? ' overdue' : '')}
            style={done ? { borderColor: h.color, background: h.color + '26' } : undefined}
            onClick={async () => {
              const now = await toggleHabit(h.id, date, sl.id);
              if (now) toast(`${h.icon} ${sl.name} ✓ +${XP.slot} XP`);
            }}
            title={sl.time ? `${sl.name} ${sl.time}` : sl.name}
          >
            <span className="slot-check" style={done ? { background: h.color, borderColor: h.color } : undefined}>{done ? '✓' : ''}</span>
            <span className="slot-name">{sl.name}</span>
            {!compact && sl.time && <span className="small muted">{sl.time}</span>}
            {at && <span className="small" style={{ color: late ? 'var(--yellow)' : h.color }}>{late ? '⏱ ' : ''}{timeOfTs(at)}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Alışkanlık: haftalık ızgara (satır = gün, sütun = hafta) ----------
export function HabitGridCard({ h, weeks = 9 }: { h: Habit; weeks?: number }) {
  const { today, t, prefs } = useData();
  const { idx, s } = useHabitStats(h);
  const [offset, setOffset] = useState(0); // kaç hafta geriye
  const curWeek = addDays(startOfWeek(today, prefs.weekStartsMonday), -7 * offset);
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(curWeek, -7 * (weeks - 1 - i)));
  const dow = prefs.weekStartsMonday ? t.dow : [t.dow[6], ...t.dow.slice(0, 6)];
  const slotted = isSlotted(h);
  const fromD = fromKey(weekStarts[0]);
  const toD = fromKey(addDays(weekStarts[weeks - 1], 6));
  return (
    <div className="card">
      <button className="card-title link-title" onClick={() => openEditor({ kind: 'habitDetail', id: h.id })}>
        <span>{h.icon}</span>
        <span className="t">{h.name}</span>
        {h.share && (
          <span className="badge accent" title={t('shared_badge')}>
            👥
          </span>
        )}
      </button>
      <div className={s.doneToday ? 'ok' : 'small muted'} style={s.doneToday ? { color: h.color } : undefined}>
        {s.doneToday ? '✓ ' + t('completed_today') : slotted ? `◐ ${s.todayCount}/${s.todayTotal}` : '○ ' + t('not_completed')}
      </div>
      <div className="month-nav">
        <button className="icon-btn" onClick={() => setOffset(offset + weeks)}>‹</button>
        <span className="small muted">
          {fromD.getDate()} {t.months[fromD.getMonth()].slice(0, 3)} – {toD.getDate()} {t.months[toD.getMonth()].slice(0, 3)} {toD.getFullYear()}
        </span>
        <button className="icon-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - weeks))}>›</button>
      </div>
      <div className="week-grid" style={{ gridTemplateColumns: `22px repeat(${weeks}, 1fr)` }}>
        {dow.map((d, row) => (
          <Row key={d} label={d}>
            {weekStarts.map((ws) => {
              const k = addDays(ws, row);
              const info = idx.get(k);
              const future = k > today;
              return (
                <button
                  key={k}
                  title={info && slotted ? `${k} · ${info.count}/${info.total}` : k}
                  disabled={future}
                  className={'c' + (k === today ? ' today' : '') + (future ? ' future' : '') + (isScheduled(h, k) ? '' : ' off')}
                  style={cellStyle(h, info)}
                  onClick={() => (slotted ? openEditor({ kind: 'habitDay', id: h.id, date: k }) : toggleHabit(h.id, k))}
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
      <MarkButton habit={h} done={s.doneToday} count={s.todayCount} total={s.todayTotal} />
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
  if (task.startDate && task.startDate > today && task.startDate < task.dueDate) return { text: '🗓 ' + t('starts_in', { n: diffDays(task.startDate, today) }) + ' · ' + t('due_in', { n: d }), cls: 'muted' };
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
        <span>{task.milestone ? '◆' : isTargeted(task) ? '🎯' : '📄'}</span>
        <span className="t">{task.title}</span>
      </div>
      {p && (
        <div className="meta">
          {p.icon} {p.name}
        </div>
      )}
      <div className="row" style={{ gap: 6 }}>
        {statusBadge(task, t)}
        <PaceBadge task={task} />
      </div>
      <div className={'meta ' + due.cls}>{due.text}</div>
      <div className="meta">
        <TaskTags task={task} />
      </div>
      <TaskProgressLine task={task} color={p?.color} />
      <CompleteButton task={task} />
    </div>
  );
}

export function CompleteButton({ task }: { task: Task }) {
  const { t } = useData();
  if (isTargeted(task)) return <TaskCheckButton task={task} />;
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
  const targeted = isTargeted(task);
  return (
    <div className={'task-row' + (done ? ' done' : '')}>
      {targeted ? (
        <span className="check round" style={{ fontSize: 13 }} title={t('tk_targeted')}>
          🎯
        </span>
      ) : (
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
      )}
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
          <TaskTags task={task} />
          <PaceBadge task={task} />
        </div>
        <TaskProgressLine task={task} color={p?.color} />
        <Checklist task={task} />
      </div>
      {targeted ? <TaskCheckButton task={task} compact /> : statusBadge(task, t)}
    </div>
  );
}

export type TaskTab = 'today' | 'yesterday' | 'overdue' | 'upcoming' | 'unrelated' | 'inbox' | 'completed' | 'all';

export function filterTasks(tasks: Task[], tab: TaskTab, today: string): Task[] {
  const open = tasks.filter((t) => t.status !== 'done');
  const byDue = (a: Task, b: Task) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.priority - a.priority;
  switch (tab) {
    case 'today':
      return open.filter((t) => onDay(t, today)).sort(byDue);
    case 'yesterday':
      return tasks.filter((t) => t.dueDate === addDays(today, -1)).sort(byDue);
    case 'overdue':
      return open.filter((t) => t.dueDate && t.dueDate < today).sort(byDue);
    case 'upcoming':
      return open.filter((t) => t.dueDate && t.dueDate > today && !onDay(t, today)).sort(byDue);
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
    <div className="card clickable" onClick={() => openEditor({ kind: 'projectDetail', id: p.id })}>
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

