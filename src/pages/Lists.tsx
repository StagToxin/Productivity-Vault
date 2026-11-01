// Alışkanlıklar, Görevler, Projeler ve Takvim sayfaları
import { useState } from 'react';
import { filterTasks, HabitCard, HabitGridCard, ProjectCard, TaskRow, type TaskTab } from '../components/blocks';
import { CalendarModeSeg, CalendarNav, CalendarView, useCalendarState, type CalMode } from '../components/Calendar';
import { useMedia } from '../components/ui';
import { openEditor } from '../components/Editors';
import { MissedList } from '../components/HabitViews';
import { Seg } from '../components/ui';
import { reorderHabits, saveProject } from '../lib/actions';
import { useData } from '../lib/store';

export function HabitsPage() {
  const { habits, t } = useData();
  const [view, setView] = useState<'cards' | 'grid' | 'missed' | 'archived'>(location.hash.endsWith(':missed') ? 'missed' : 'cards');
  const active = habits.filter((h) => !h.archived);
  const archived = habits.filter((h) => h.archived);
  const move = (id: string, dir: -1 | 1) => {
    const ids = active.map((h) => h.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void reorderHabits(ids);
  };
  return (
    <div>
      <div className="page-head">
        <h1>📅 {t('nav_habits')}</h1>
        <div className="grow" />
        <button className="btn primary" onClick={() => openEditor({ kind: 'habit' })}>
          ＋ {t('add_habit')}
        </button>
      </div>
      <div className="chip-row">
        <Seg
          value={view}
          onChange={setView}
          options={[
            { v: 'cards', l: '🎯 ' + t('w_habits').split('&')[0] },
            { v: 'grid', l: '☑️ ' + t('w_habitGrid') },
            { v: 'missed', l: `⚠️ ${t('tab_missed')}` },
            { v: 'archived', l: `🗄 ${t('archived')} (${archived.length})` },
          ]}
        />
      </div>
      {view === 'missed' ? (
        <MissedList />
      ) : view === 'archived' ? (
        archived.length ? (
          <div className="gallery">{archived.map((h) => <HabitCard key={h.id} h={h} />)}</div>
        ) : (
          <div className="empty">—</div>
        )
      ) : active.length === 0 ? (
        <div className="empty">
          <button className="btn primary" onClick={() => openEditor({ kind: 'habit' })}>
            ＋ {t('add_habit')}
          </button>
        </div>
      ) : (
        <div className="gallery">
          {active.map((h) => (
            <div key={h.id} style={{ position: 'relative' }}>
              {view === 'grid' ? <HabitGridCard h={h} weeks={12} /> : <HabitCard h={h} />}
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex' }}>
                <button className="icon-btn" aria-label="up" onClick={() => move(h.id, -1)}>
                  ←
                </button>
                <button className="icon-btn" aria-label="down" onClick={() => move(h.id, 1)}>
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TasksPage() {
  const { tasks, today, t } = useData();
  const [tab, setTab] = useState<TaskTab>('today');
  const [q, setQ] = useState('');
  const tabs: TaskTab[] = ['today', 'yesterday', 'overdue', 'upcoming', 'unrelated', 'inbox', 'completed', 'all'];
  const list = filterTasks(tasks, tab, today).filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="page-head">
        <h1>📁 {t('nav_tasks')}</h1>
        <div className="grow" />
        <button className="btn primary" onClick={() => openEditor({ kind: 'task', defaults: tab === 'inbox' ? { dueDate: undefined } : {} })}>
          ＋ {t('add_task')}
        </button>
      </div>
      <div className="chip-row">
        {tabs.map((x) => (
          <button key={x} className={'chip' + (tab === x ? ' active' : '')} onClick={() => setTab(x)}>
            {t(`tab_${x}` as 'tab_today')} <span className="count">{filterTasks(tasks, x, today).length}</span>
          </button>
        ))}
      </div>
      <input className="input" placeholder="🔍" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, maxWidth: 360 }} />
      {list.length ? list.map((x) => <TaskRow key={x.id} task={x} />) : <div className="empty">{t('empty_tasks')}</div>}
    </div>
  );
}

export function ProjectsPage() {
  const { projects, tasks, t } = useData();
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [open, setOpen] = useState<string | null>(null);
  const list = projects.filter((p) => p.status === tab);
  const sel = projects.find((p) => p.id === open);
  return (
    <div>
      <div className="page-head">
        <h1>🗂 {t('nav_projects')}</h1>
        <div className="grow" />
        <button className="btn primary" onClick={() => openEditor({ kind: 'project' })}>
          ＋ {t('add_project')}
        </button>
      </div>
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
          <div key={p.id} onClickCapture={(e) => (e.stopPropagation(), setOpen(p.id))}>
            <ProjectCard p={p} />
          </div>
        ))}
      </div>
      {sel && (
        <div className="section" style={{ marginTop: 18 }}>
          <div className="section-head">
            <div className="section-title">
              <span className="emoji">{sel.icon}</span> {sel.name}
            </div>
            <button className="btn sm" onClick={() => openEditor({ kind: 'project', id: sel.id })}>
              {t('edit')}
            </button>
            <button className="btn sm" onClick={() => saveProject({ ...sel, status: sel.status === 'done' ? 'active' : 'done' })}>
              {sel.status === 'done' ? t('reopen') : '✓ ' + t('mark_project_done')}
            </button>
            <button className="icon-btn" onClick={() => setOpen(null)}>
              ✕
            </button>
          </div>
          {tasks
            .filter((x) => x.projectId === sel.id)
            .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
            .map((x) => (
              <TaskRow key={x.id} task={x} />
            ))}
          <button className="new-row" style={{ marginTop: 8 }} onClick={() => openEditor({ kind: 'task', defaults: { projectId: sel.id } })}>
            ＋ {t('add_task')}
          </button>
        </div>
      )}
    </div>
  );
}

export function CalendarPage() {
  const { t } = useData();
  const narrow = useMedia('(max-width: 860px)');
  const c = useCalendarState((narrow ? 'day' : 'weekTime') as CalMode);
  return (
    <div>
      <div className="page-head">
        <h1>🗓 {t('nav_calendar')}</h1>
        <div className="grow" />
        <CalendarModeSeg mode={c.mode} setMode={c.setMode} />
      </div>
      <CalendarNav mode={c.mode} anchor={c.anchor} setAnchor={c.setAnchor} />
      <CalendarView {...c} />
    </div>
  );
}
