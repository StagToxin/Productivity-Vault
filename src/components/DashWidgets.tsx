// Pano: geri sayım ve haftalık özet bileşenleri.
import { useMemo, useState } from 'react';
import { addDays, diffDays, fromKey, isoWeek, keyOfTs, range, startOfWeek } from '../lib/dates';
import { effectiveTarget, habitUnit, isScheduled } from '../lib/logic';
import { useData } from '../lib/store';
import { isTargeted, taskOutcome, taskProgress } from '../lib/tasks';
import { projectInfo } from './blocks';
import { openEditor } from './Editors';
import { PaceBadge } from './TaskBits';
import { Bar } from './ui';

export function CountdownWidget() {
  const { tasks, projects, t, today, checksOf } = useData();
  const items = useMemo(() => {
    const horizon = addDays(today, 90);
    const out: { key: string; date: string; icon: string; title: string; pct: number; color?: string; open: () => void; taskId?: string; sub?: string }[] = [];
    for (const x of tasks) {
      if (x.status === 'done' || !x.dueDate || x.dueDate < today || x.dueDate > horizon) continue;
      if (!(isTargeted(x) || x.priority === 2 || x.milestone)) continue;
      const p = taskProgress(x, checksOf(x.id));
      const proj = projects.find((q) => q.id === x.projectId);
      out.push({ key: x.id, date: x.dueDate, icon: x.milestone ? '◆' : isTargeted(x) ? '🎯' : '❗', title: x.title, pct: p.pct, color: proj?.color, open: () => openEditor({ kind: 'task', id: x.id }), taskId: x.id, sub: isTargeted(x) ? `${p.count}/${p.target}` : undefined });
    }
    for (const p of projects) {
      if (p.status === 'done' || !p.deadline || p.deadline < today || p.deadline > horizon) continue;
      const i = projectInfo(p, tasks, today);
      out.push({ key: p.id, date: p.deadline, icon: p.icon, title: p.name, pct: i.progress, color: p.color, open: () => openEditor({ kind: 'projectDetail', id: p.id }), sub: `${i.done}/${i.total}` });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [tasks, projects, today, checksOf]);
  if (!items.length) return <div className="empty small">{t('cd_empty')}</div>;
  return (
    <div className="cd-list">
      {items.map((it) => {
        const n = diffDays(it.date, today);
        const task = it.taskId ? tasks.find((x) => x.id === it.taskId) : undefined;
        return (
          <button key={it.key} className="cd-item" onClick={it.open}>
            <div className={'cd-n' + (n <= 2 ? ' soon' : '')}>
              <b>{n === 0 ? '!' : n}</b>
              <span>{n === 0 ? t('due_today') : t('day_unit')}</span>
            </div>
            <div className="cd-body">
              <div className="cd-t">
                {it.icon} {it.title}
              </div>
              <div className="progress-row">
                <Bar value={it.pct} color={it.color} />
                <span className="small">%{Math.round(it.pct * 100)}</span>
                {it.sub && <span className="small muted">{it.sub}</span>}
              </div>
            </div>
            {task && <PaceBadge task={task} />}
          </button>
        );
      })}
    </div>
  );
}

export function WeeklyWidget() {
  const { t, today, prefs, focus, tasks, projects, checks, habits, idxOf, xpDay } = useData();
  const [off, setOff] = useState(0);
  const ws = addDays(startOfWeek(today, prefs.weekStartsMonday), off * 7);
  const we = addDays(ws, 6);
  const days = range(ws, we);
  const s = useMemo(() => {
    const inWeek = (k?: string) => !!k && k >= ws && k <= we;
    const fs = focus.filter((f) => inWeek(f.date));
    const focusMin = fs.reduce((a, f) => a + f.minutes, 0);
    const byProject = new Map<string, number>();
    for (const f of fs) {
      const pid = (f.taskId && tasks.find((x) => x.id === f.taskId)?.projectId) || '';
      byProject.set(pid, (byProject.get(pid) ?? 0) + f.minutes);
    }
    const doneTasks = tasks.filter((x) => x.status === 'done' && x.doneAt && inWeek(keyOfTs(x.doneAt))).length;
    const failed = tasks.filter((x) => inWeek(x.dueDate) && taskOutcome(x, today) === 'failed').length;
    const nChecks = checks.filter((c) => inWeek(c.date)).length;
    let sched = 0;
    let done = 0;
    for (const h of habits.filter((x) => !x.archived)) {
      const idx = idxOf(h.id);
      const past = days.filter((k) => k <= today);
      if (habitUnit(h) === 'day') {
        for (const k of past) {
          if (!isScheduled(h, k)) continue;
          sched++;
          if (idx.get(k)?.complete) done++;
        }
      } else {
        sched += effectiveTarget(h);
        done += Math.min(effectiveTarget(h), days.filter((k) => idx.get(k)?.complete).length);
      }
    }
    const xp = days.map((k) => xpDay.get(k) ?? 0);
    const best = Math.max(...xp);
    return { focusMin, byProject: [...byProject.entries()].sort((a, b) => b[1] - a[1]), doneTasks, failed, nChecks, habitRate: sched ? done / sched : 0, xp, best, bestDay: best > 0 ? days[xp.indexOf(best)] : null };
  }, [ws, we, focus, tasks, checks, habits, idxOf, xpDay, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ${t('hours')} ${m % 60} ${t('min_short')}` : `${m} ${t('min_short')}`);
  const maxP = Math.max(1, ...s.byProject.map(([, v]) => v));
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <b style={{ flex: 1 }}>
          {fromKey(ws).getDate()} {t.months[fromKey(ws).getMonth()].slice(0, 3)} – {fromKey(we).getDate()} {t.months[fromKey(we).getMonth()].slice(0, 3)} · {t('perf_week')} {isoWeek(ws)}
        </b>
        <button className="btn sm" onClick={() => setOff(off - 1)}>
          ‹
        </button>
        <button className="btn sm" disabled={off >= 0} onClick={() => setOff(off + 1)}>
          ›
        </button>
      </div>
      <div className="kpis">
        <div className="kpi">
          <b>{hm(s.focusMin)}</b>
          <span>⏱ {t('wk_focus')}</span>
        </div>
        <div className="kpi">
          <b>{s.doneTasks}</b>
          <span>✅ {t('wk_tasksDone')}</span>
        </div>
        <div className="kpi">
          <b className={s.failed ? 'bad' : ''}>{s.failed}</b>
          <span>⚠️ {t('wk_failed')}</span>
        </div>
        <div className="kpi">
          <b>%{Math.round(s.habitRate * 100)}</b>
          <span>📅 {t('wk_habits')}</span>
        </div>
        <div className="kpi">
          <b>{s.nChecks}</b>
          <span>🎯 {t('wk_checks')}</span>
        </div>
        <div className="kpi">
          <b>{s.xp.reduce((a, b) => a + b, 0)}</b>
          <span>⭐ XP</span>
        </div>
      </div>
      <div className="wk-days">
        {days.map((k, i) => (
          <div key={k} className={'wk-d' + (k === s.bestDay ? ' best' : '') + (k > today ? ' fut' : '')} title={`${k}: ${s.xp[i]} XP`}>
            <i style={{ height: `${s.best ? (s.xp[i] / s.best) * 100 : 0}%` }} />
            <span>{t.dow[(i + (prefs.weekStartsMonday ? 0 : 6)) % 7].slice(0, 2)}</span>
          </div>
        ))}
      </div>
      {s.byProject.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="small muted" style={{ marginBottom: 4 }}>
            {t('wk_focusBy')}
          </div>
          {s.byProject.map(([pid, m]) => {
            const p = projects.find((x) => x.id === pid);
            return (
              <div key={pid} className="progress-row">
                <span className="small" style={{ width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p ? `${p.icon} ${p.name}` : t('wk_other')}
                </span>
                <Bar value={m / maxP} color={p?.color} />
                <span className="small">{hm(m)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
