import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState, type ReactNode } from 'react';
import { filterTasks, HabitCard, HabitGridCard, ProjectCard, TaskCard, type TaskTab } from '../components/blocks';
import { CalendarModeSeg, CalendarNav, CalendarView, useCalendarState } from '../components/Calendar';
import { openEditor } from '../components/Editors';
import { useMissed } from '../components/HabitViews';
import { CountdownWidget, WeeklyWidget } from '../components/DashWidgets';
import { Bar, useMedia } from '../components/ui';
import { DEFAULT_WIDGETS, reorderSubset, updatePrefs } from '../lib/actions';
import { addDays, fromKey, isoWeek, startOfWeek } from '../lib/dates';
import { habitStats } from '../lib/logic';
import { useData } from '../lib/store';
import { fmtClock, timer, useTimer } from '../lib/timer';
import { buildPlan } from '../lib/plan';
import { segLabel } from '../components/MiniTimer';
import type { WidgetId, WidgetPref } from '../lib/types';
import type { Page } from '../App';

const NARROW: WidgetId[] = ['performance', 'streak', 'countdown', 'actions', 'habitStats', 'focus'];
const ICONS: Record<WidgetId, string> = {
  performance: '📊', streak: '🔥', actions: '⚡', habits: '📅', habitGrid: '☑️', tasks: '📁', projects: '🗂', calendar: '🗓', habitStats: '✅', focus: '⏱️', countdown: '⏳', weekly: '🧾',
};

export default function Dashboard({ go }: { go: (p: Page) => void }) {
  const { prefs, t } = useData();
  const [editing, setEditing] = useState(false);
  const wide = useMedia('(min-width: 1101px)');
  const widgets = prefs.widgets;
  const visible = (w: WidgetPref) => editing || !w.hidden;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = (list: WidgetPref[]) => updatePrefs({ widgets: list });
  const patchW = (id: WidgetId, p: Partial<WidgetPref>) => save(widgets.map((w) => (w.id === id ? { ...w, ...p } : w)));

  const onDragEnd = (subset: WidgetId[]) => (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = subset.indexOf(e.active.id as WidgetId);
    const to = subset.indexOf(e.over.id as WidgetId);
    const reordered = arrayMove(subset, from, to);
    // Alt kümenin yeni sırasını genel listeye yerleştir
    void save(reorderSubset(widgets, subset, reordered));
  };

  const render = (w: WidgetPref) => (
    <SortableSection key={w.id} w={w} editing={editing} onPatch={(p) => patchW(w.id, p)}>
      <Widget id={w.id} go={go} />
    </SortableSection>
  );

  const column = (ids: WidgetId[]) => {
    const list = widgets.filter((w) => ids.includes(w.id) && visible(w));
    const subset = list.map((w) => w.id);
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(subset)}>
        <SortableContext items={subset} strategy={verticalListSortingStrategy}>
          <div className="dash-col">{list.map(render)}</div>
        </SortableContext>
      </DndContext>
    );
  };

  return (
    <div>
      <div className="page-icon"><img src="icon.svg" alt="" style={{ width: 44, height: 44, borderRadius: 11 }} /></div>
      <div className="page-head">
        <h1>{t('appName')}</h1>
        <div className="grow" />
        <button className={'btn sm' + (editing ? ' primary' : '')} onClick={() => setEditing(!editing)}>
          {editing ? '✓ ' + t('done_btn') : '⚙︎ ' + t('edit_layout')}
        </button>
      </div>
      {editing && (
        <div className="row" style={{ marginTop: -8, marginBottom: 12 }}>
          <span className="muted small" style={{ flex: 1 }}>
            {t('drag_hint')}
          </span>
          <button className="btn sm" onClick={() => save(DEFAULT_WIDGETS.map((id) => ({ id, hidden: false, collapsed: false })))}>
            ↺ {t('reset_layout')}
          </button>
        </div>
      )}
      {wide ? (
        <div className="dash">
          {column(NARROW)}
          {column(widgets.map((w) => w.id).filter((id) => !NARROW.includes(id)))}
        </div>
      ) : (
        column(widgets.map((w) => w.id))
      )}
    </div>
  );
}

function SortableSection({ w, editing, onPatch, children }: { w: WidgetPref; editing: boolean; onPatch: (p: Partial<WidgetPref>) => void; children: ReactNode }) {
  const { t } = useData();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id, disabled: !editing });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: w.hidden ? 0.4 : isDragging ? 0.7 : 1,
    zIndex: isDragging ? 5 : undefined,
    position: 'relative' as const,
  };
  return (
    <section ref={setNodeRef} style={style} className="section">
      <div className="section-head">
        {editing && (
          <button className="icon-btn drag-handle" aria-label="drag" {...attributes} {...listeners}>
            ⠿
          </button>
        )}
        <div className="section-title">
          <span className="emoji">{ICONS[w.id]}</span>
          {t(`w_${w.id}` as 'w_tasks')}
        </div>
        {editing && (
          <button className="icon-btn" title={w.hidden ? t('show') : t('hide')} onClick={() => onPatch({ hidden: !w.hidden })}>
            {w.hidden ? '🙈' : '👁'}
          </button>
        )}
        <button className="icon-btn" title={w.collapsed ? t('expand') : t('collapse')} onClick={() => onPatch({ collapsed: !w.collapsed })}>
          {w.collapsed ? '»' : '«'}
        </button>
      </div>
      {!w.collapsed && children}
    </section>
  );
}

function Widget({ id, go }: { id: WidgetId; go: (p: Page) => void }) {
  switch (id) {
    case 'performance':
      return <Performance />;
    case 'streak':
      return <StreakWidget />;
    case 'actions':
      return <QuickActions go={go} />;
    case 'habits':
      return <HabitsWidget grid={false} />;
    case 'habitGrid':
      return <HabitsWidget grid />;
    case 'tasks':
      return <TasksWidget />;
    case 'projects':
      return <ProjectsWidget />;
    case 'calendar':
      return <CalendarWidget />;
    case 'habitStats':
      return <HabitStatsWidget />;
    case 'focus':
      return <FocusWidget go={go} />;
    case 'countdown':
      return <CountdownWidget />;
    case 'weekly':
      return <WeeklyWidget />;
  }
}

function Performance() {
  const { t, today, tasks, prefs } = useData();
  const d = fromKey(today);
  const h = new Date().getHours();
  const greet = h < 5 ? 'greeting_night' : h < 12 ? 'greeting_morning' : h < 18 ? 'greeting_day' : h < 22 ? 'greeting_evening' : 'greeting_night';
  const todo = tasks.filter((x) => x.dueDate === today);
  const overdue = tasks.filter((x) => x.status !== 'done' && x.dueDate && x.dueDate < today);
  const lwStart = addDays(startOfWeek(today, prefs.weekStartsMonday), -7);
  const lastWeekOverdue = tasks.filter((x) => x.dueDate && x.dueDate >= lwStart && x.dueDate < addDays(lwStart, 7) && (x.status !== 'done' || (x.doneAt && x.doneAt > fromKey(x.dueDate).getTime() + 86400000))).length;
  const monthPrefix = today.slice(0, 7);
  const upcoming = tasks.filter((x) => x.status !== 'done' && x.dueDate && x.dueDate > today && x.dueDate.startsWith(monthPrefix)).length;
  const missed = useMissed(7);
  const missedY = missed.filter((x) => x.date === addDays(today, -1)).length;
  const dayName = d.toLocaleDateString(prefs.lang === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="card" style={{ gap: 6 }}>
      <div className="card-title">🔥 {t('w_performance')}</div>
      <div className="meta">
        📅 {dayName} ({t('perf_week')} {isoWeek(today)})
      </div>
      <div className="small">
        {t(greet)}
        {prefs.displayName ? ' ' + prefs.displayName : ''}, {t('perf_glimpse')}
      </div>
      <div className="small ok-green">
        {t('perf_todo')}: ({todo.filter((x) => x.status === 'done').length}/{todo.length})
      </div>
      {todo.map((x) => (
        <div key={x.id} className="small" style={{ paddingLeft: 8, textDecoration: x.status === 'done' ? 'line-through' : undefined, color: x.status === 'done' ? 'var(--text-3)' : undefined }}>
          📄 {x.title}
        </div>
      ))}
      <hr className="sep" />
      <div className="small" style={{ color: 'var(--yellow)' }}>
        ◆ {t('perf_overdue')} ({overdue.length})
      </div>
      {overdue.length === 0 ? (
        <div className="small ok-green">{t('perf_noOverdue')}</div>
      ) : (
        overdue.slice(0, 5).map((x) => (
          <div key={x.id} className="small bad" style={{ paddingLeft: 8 }}>
            📄 {x.title}
          </div>
        ))
      )}
      <hr className="sep" />
      <div className="small">⚠️ {t('perf_overdueLastWeek', { n: lastWeekOverdue })}</div>
      {missedY > 0 && (
        <button className="small link-title bad" style={{ padding: 0 }} onClick={() => (location.hash = 'habits:missed')}>
          🕒 {t('perf_missedYesterday', { n: missedY })} →
        </button>
      )}
      <div className="small">📅 {t('perf_upcoming', { n: upcoming })}</div>
    </div>
  );
}

export function StreakWidget() {
  const { t, streak, level, xp, xpDay, today, prefs } = useData();
  const todayXp = xpDay.get(today) ?? 0;
  const ws = startOfWeek(today, prefs.weekStartsMonday);
  const dow = prefs.weekStartsMonday ? t.dow : [t.dow[6], ...t.dow.slice(0, 6)];
  return (
    <div className="card" style={{ gap: 12 }}>
      <div className="streak-card">
        <div className={'flame' + (streak.todayDone ? '' : ' off')}>🔥</div>
        <div style={{ flex: 1 }}>
          <div className="streak-num">{streak.current}</div>
          <div className="small muted">{t('streak_days')}</div>
        </div>
        <div className="level-ring" style={{ '--p': level.progress } as React.CSSProperties} title={`${level.into}/${level.need} XP`}>
          <div>{level.level}</div>
        </div>
      </div>
      <div className="week-strip">
        {dow.map((d, i) => {
          const k = addDays(ws, i);
          const st = streak.days.get(k) ?? 'none';
          return (
            <div key={k}>
              {d}
              <div className={'d ' + st}>{st === 'done' ? '🔥' : st === 'frozen' ? '🧊' : ''}</div>
            </div>
          );
        })}
      </div>
      <div className="progress-row">
        <span>{t('dailyGoal')}</span>
        <Bar value={todayXp / Math.max(1, prefs.dailyGoalXp)} />
        <span className="small">
          {todayXp}/{prefs.dailyGoalXp} XP
        </span>
      </div>
      <div className={streak.todayDone ? 'ok' : 'small muted'}>{streak.todayDone ? '✓ ' + t('streak_todayDone') : t('streak_todayPending', { n: Math.max(0, prefs.dailyGoalXp - todayXp) })}</div>
      <div className="meta">
        ⭐ {t('level')} {level.level} · {xp} XP · 🏆 {t('streak_longest')}: {streak.longest} · 🧊 {t('streak_freezes')}: {streak.freezes}
      </div>
    </div>
  );
}

function QuickActions({ go }: { go: (p: Page) => void }) {
  const { t } = useData();
  const items: [string, () => void][] = [
    [t('add_task'), () => openEditor({ kind: 'task' })],
    [t('add_project'), () => openEditor({ kind: 'project' })],
    [t('add_habit'), () => openEditor({ kind: 'habit' })],
    [t('start_focus'), () => (timer.setMode('plan'), go('focus'))],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map(([l, f]) => (
        <button key={l} className="nav-item" onClick={f}>
          <span className="ico">＋</span> {l}
        </button>
      ))}
    </div>
  );
}

function HabitsWidget({ grid }: { grid: boolean }) {
  const { habits, t } = useData();
  const active = habits.filter((h) => !h.archived);
  return (
    <>
      <div className="gallery">{active.map((h) => (grid ? <HabitGridCard key={h.id} h={h} /> : <HabitCard key={h.id} h={h} />))}</div>
      <div style={{ marginTop: 10 }}>
        <button className="new-row" onClick={() => openEditor({ kind: 'habit' })}>
          ＋ {t('add_habit')}
        </button>
      </div>
    </>
  );
}

function TasksWidget() {
  const { tasks, today, t } = useData();
  const [tab, setTab] = useState<TaskTab>('today');
  // "Yaklaşan" olmadan, tarihi ileride olan (ör. projeye bağlı) görevler panoda hiçbir sekmede görünmüyordu.
  const tabs: TaskTab[] = ['today', 'overdue', 'upcoming', 'inbox', 'unrelated', 'yesterday'];
  const list = filterTasks(tasks, tab, today);
  return (
    <>
      <div className="chip-row">
        {tabs.map((x) => (
          <button key={x} className={'chip' + (tab === x ? ' active' : '')} onClick={() => setTab(x)}>
            {t(`tab_${x}` as 'tab_today')} <span className="count">{filterTasks(tasks, x, today).length}</span>
          </button>
        ))}
      </div>
      <div className="gallery">
        {list.slice(0, 8).map((x) => (
          <TaskCard key={x.id} task={x} />
        ))}
        <button className="card clickable new-row" style={{ maxWidth: 'none', minHeight: 80, alignItems: 'center', justifyContent: 'center' }} onClick={() => openEditor({ kind: 'task', defaults: tab === 'inbox' ? { dueDate: undefined } : {} })}>
          ＋ {t('add_task')}
        </button>
      </div>
    </>
  );
}

function ProjectsWidget() {
  const { projects, t } = useData();
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const list = projects.filter((p) => p.status === tab);
  return (
    <>
      <div className="chip-row">
        <button className={'chip' + (tab === 'active' ? ' active' : '')} onClick={() => setTab('active')}>
          ☐ {t('proj_active')}
        </button>
        <button className={'chip' + (tab === 'done' ? ' active' : '')} onClick={() => setTab('done')}>
          ☑ {t('proj_complete')}
        </button>
      </div>
      <div className="gallery">
        {list.map((p) => (
          <ProjectCard key={p.id} p={p} />
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="new-row" onClick={() => openEditor({ kind: 'project' })}>
          ＋ {t('add_project')}
        </button>
      </div>
    </>
  );
}

function CalendarWidget() {
  const c = useCalendarState('week');
  return (
    <>
      <div className="chip-row">
        <CalendarModeSeg mode={c.mode} setMode={c.setMode} modes={['day', 'week', 'weekTime', 'month']} />
      </div>
      <CalendarNav mode={c.mode} anchor={c.anchor} setAnchor={c.setAnchor} />
      <CalendarView {...c} />
    </>
  );
}

function HabitStatsWidget() {
  const { habits, idxOf, today, t, prefs } = useData();
  const active = habits.filter((h) => !h.archived);
  const stats = useMemo(() => active.map((h) => ({ h, s: habitStats(h, idxOf(h.id), today, prefs.weekStartsMonday) })), [active, idxOf, today, prefs.weekStartsMonday]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {stats.map(({ h, s }) => (
        <div key={h.id} className="card" style={{ gap: 4 }}>
          <div className="card-title">
            <span>{h.icon}</span>
            <span className="t">{h.name}</span>
          </div>
          <div className="meta">
            {t('records_month')}: {s.monthCount} · {t('total')}: {s.totalDone}
            {s.minutes > 0 && ` · ⏱ ${s.minutes} ${t('minutes')}`}
          </div>
          <div className="progress-row">
            <span>{t('rate30')}</span>
            <Bar value={s.rate30} color={h.color} />
            <span className="small">{Math.round(s.rate30 * 100)}%</span>
          </div>
          <div className={s.doneToday ? 'ok' : 'small muted'} style={s.doneToday ? { color: h.color } : undefined}>
            {s.doneToday ? '✓ ' + t('completed_today') : '○ ' + t('not_completed')}
          </div>
          <div className="meta">
            🔥 {s.streak} {t(s.unit === 'day' ? 'day_unit' : 'week_unit')} | {t('max')}: {s.maxStreak}
          </div>
        </div>
      ))}
    </div>
  );
}

function FocusWidget({ go }: { go: (p: Page) => void }) {
  const { t, focus, today, prefs } = useData();
  const tm = useTimer();
  const mins = focus.filter((f) => f.date === today).reduce((s, f) => s + f.minutes, 0);
  const sw = tm.mode === 'stopwatch';
  const plans = prefs.focusPlans ?? [];
  const busy = sw ? !!tm.swStart || tm.sw > 0 : tm.active;
  return (
    <div className="card" style={{ alignItems: 'center', textAlign: 'center' }}>
      <div className="small muted">{segLabel(tm, t)}</div>
      <div style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{sw ? fmtClock(tm.sw) : tm.active ? fmtClock(tm.left) : '--:--'}</div>
      <div className="row" style={{ justifyContent: 'center' }}>
        {busy ? (
          <button className="btn primary sm" onClick={() => ((sw ? tm.swStart : tm.running) ? timer.pause() : timer.resume())}>
            {(sw ? tm.swStart : tm.running) ? '⏸ ' + t('pause') : '▶ ' + t('resume')}
          </button>
        ) : (
          plans.slice(0, 2).map((p) => (
            <button key={p.id} className="btn primary sm" onClick={() => timer.startPlan(buildPlan(p), { name: p.name, autoNext: p.autoNext, taskId: p.taskId, habitId: p.habitId })}>
              ▶ {p.name}
            </button>
          ))
        )}
        <button className="btn sm" onClick={() => go('focus')}>
          ⤢
        </button>
      </div>
      <div className="meta">
        ⏱ {t('focus_today')}: {mins} {t('minutes')}
      </div>
    </div>
  );
}
