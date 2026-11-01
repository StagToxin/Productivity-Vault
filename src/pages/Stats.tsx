import { useMemo } from 'react';
import { Area, AreaChart, Bar as RBar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, fromKey, range, startOfWeek, weekdayIndex } from '../lib/dates';
import { badges, habitStats } from '../lib/logic';
import { useData } from '../lib/store';

const axis = { stroke: 'var(--text-3)', fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />;
const tip = {
  contentStyle: { background: 'var(--card-2)', border: '1px solid var(--border-2)', borderRadius: 8, color: 'var(--text)' },
  labelStyle: { color: 'var(--text-2)' },
  cursor: { fill: 'rgba(127,127,127,0.08)' },
};

export default function StatsPage() {
  const { t, today, xpDay, xp, level, streak, habits, logs, tasks, focus, prefs, idxOf } = useData();
  const dd = (k: string) => `${fromKey(k).getDate()}/${fromKey(k).getMonth() + 1}`;

  const xp30 = useMemo(() => range(addDays(today, -29), today).map((k) => ({ d: dd(k), xp: xpDay.get(k) ?? 0 })), [xpDay, today]);
  const active = habits.filter((h) => !h.archived);
  const perHabit = useMemo(
    () => active.map((h) => ({ name: `${h.icon} ${h.name}`, rate: Math.round(habitStats(h, idxOf(h.id), today, prefs.weekStartsMonday).rate30 * 100), color: h.color })),
    [active, idxOf, today, prefs.weekStartsMonday],
  );
  const dow = prefs.weekStartsMonday ? t.dow : [t.dow[6], ...t.dow.slice(0, 6)];
  const byWeekday = useMemo(() => {
    const c = Array(7).fill(0);
    const from = addDays(today, -89);
    for (const h of habits) for (const [k, d] of idxOf(h.id)) if (d.complete && k >= from && k <= today) c[weekdayIndex(k, prefs.weekStartsMonday)]++;
    return dow.map((d, i) => ({ d, n: c[i] }));
  }, [logs, today, prefs.weekStartsMonday]); // eslint-disable-line react-hooks/exhaustive-deps
  const focus14 = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of focus) m.set(f.date, (m.get(f.date) ?? 0) + f.minutes);
    return range(addDays(today, -13), today).map((k) => ({ d: dd(k), min: m.get(k) ?? 0 }));
  }, [focus, today]);
  const tasksWeek = useMemo(() => {
    const ws = startOfWeek(today, prefs.weekStartsMonday);
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(ws, -7 * (7 - i)));
    return weeks.map((w) => {
      const end = addDays(w, 7);
      const n = tasks.filter((x) => {
        if (x.status !== 'done' || !x.doneAt) return false;
        const d = new Date(x.doneAt);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return k >= w && k < end;
      }).length;
      return { d: dd(w), n };
    });
  }, [tasks, today, prefs.weekStartsMonday]); // eslint-disable-line react-hooks/exhaustive-deps

  // Yıllık ısı haritası (53 hafta)
  const heat = useMemo(() => {
    const start = startOfWeek(addDays(today, -364), prefs.weekStartsMonday);
    const days = range(start, today);
    const max = Math.max(1, ...days.map((k) => xpDay.get(k) ?? 0));
    return days.map((k) => ({ k, v: xpDay.get(k) ?? 0, lvl: Math.ceil(((xpDay.get(k) ?? 0) / max) * 4) }));
  }, [xpDay, today, prefs.weekStartsMonday]);

  const tasksDone = tasks.filter((x) => x.status === 'done').length;
  const focusMin = focus.reduce((s, f) => s + f.minutes, 0);
  const habitChecks = logs.filter((l) => l.done).length;
  const freezesUsed = [...streak.days.values()].filter((s) => s === 'frozen').length;
  const bs = badges({ longestStreak: streak.longest, tasksDone, focusMinutes: focusMin, habitChecks, level: level.level, freezesUsed });

  const kpis: [string, string | number][] = [
    ['🔥 ' + t('streak_days'), streak.current],
    ['🏆 ' + t('streak_longest'), streak.longest],
    ['⭐ ' + t('level'), `${level.level} · ${xp} XP`],
    ['✅ ' + t('completed_tasks'), tasksDone],
    ['☑️ ' + t('nav_habits'), habitChecks],
    ['⏱ ' + t('nav_focus'), `${Math.round(focusMin / 6) / 10} h`],
  ];

  return (
    <div>
      <div className="page-head">
        <h1>📈 {t('nav_stats')}</h1>
      </div>
      <div className="stat-grid">
        {kpis.map(([l, v]) => (
          <div className="kpi" key={l}>
            <div className="v">{v}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>

      <div className="charts">
        <div className="chart-box">
          <h4>{t('stats_xp30')}</h4>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={xp30} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="xpg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid}
              <XAxis dataKey="d" {...axis} interval={4} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tip} formatter={(v) => [v, 'XP']} />
              <Area type="monotone" dataKey="xp" stroke="var(--accent)" strokeWidth={2} fill="url(#xpg)" activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-box">
          <h4>{t('stats_completion')}</h4>
          <ResponsiveContainer width="100%" height={Math.max(160, perHabit.length * 38)}>
            <BarChart data={perHabit} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" domain={[0, 100]} {...axis} unit="%" />
              <YAxis type="category" dataKey="name" {...axis} width={130} />
              <Tooltip {...tip} formatter={(v) => [`${v}%`, t('rate30')]} />
              <RBar dataKey="rate" radius={[0, 4, 4, 0]} barSize={14}>
                {perHabit.map((p) => (
                  <Cell key={p.name} fill={p.color} />
                ))}
              </RBar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-box">
          <h4>{t('stats_weekday')} (90)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byWeekday} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
              {grid}
              <XAxis dataKey="d" {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tip} formatter={(v) => [v, '✓ ' + t('nav_habits')]} />
              <RBar dataKey="n" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-box">
          <h4>{t('stats_focus')}</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={focus14} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
              {grid}
              <XAxis dataKey="d" {...axis} interval={1} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tip} formatter={(v) => [v, t('minutes')]} />
              <RBar dataKey="min" fill="var(--green)" radius={[4, 4, 0, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-box">
          <h4>{t('stats_tasksWeek')}</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tasksWeek} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
              {grid}
              <XAxis dataKey="d" {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tip} formatter={(v) => [v, '✅ ' + t('nav_tasks')]} />
              <RBar dataKey="n" fill="var(--blue)" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-box">
          <h4>{t('stats_badges')}</h4>
          <div className="badges">
            {bs.map((b) => (
              <div key={b.id} className={'badge-tile' + (b.earned ? '' : ' locked')} title={`${Math.round(b.progress * 100)}%`}>
                <div className="e">{b.icon}</div>
                <div className="n">{t(`badge_${b.id}` as 'badge_frozen')}</div>
                {!b.earned && (
                  <div className="bar" style={{ marginTop: 6, height: 4 }}>
                    <i style={{ width: `${b.progress * 100}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-box" style={{ marginTop: 16 }}>
        <h4>{t('stats_heatmap')}</h4>
        <div className="heat">
          {heat.map((c) => (
            <i key={c.k} title={`${c.k}: ${c.v} XP`} style={c.lvl ? { background: `rgba(var(--accent-rgb), ${0.2 + c.lvl * 0.2})` } : undefined} />
          ))}
        </div>
        <div className="row small muted" style={{ justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
          {t('less')}
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} style={{ width: 11, height: 11, borderRadius: 2, display: 'inline-block', background: l ? `rgba(var(--accent-rgb), ${0.2 + l * 0.2})` : 'var(--cell)' }} />
          ))}
          {t('more')}
        </div>
      </div>
    </div>
  );
}
