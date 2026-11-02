// Takvim: gün / hafta / saatli hafta / ay / yıl görünümleri.
import { useEffect, useMemo, useRef, useState } from 'react';
import { toggleHabit } from '../lib/actions';
import { addDays, addMonths, daysInMonth, fromKey, hmToMin, isoWeek, minToHm, range, startOfMonth, startOfWeek, timeOfTs, weekdayIndex } from '../lib/dates';
import { isScheduled, isSlotted } from '../lib/logic';
import { onDay, startOf } from '../lib/tasks';
import { editorOpen } from './Editors';
import { useDragSelect } from './useDragSelect';
import { useData } from '../lib/store';
import { openEditor } from './Editors';
import { Seg } from './ui';

export type CalMode = 'day' | 'week' | 'weekTime' | 'month' | 'year';

export function useCalendarState(initial: CalMode = 'week') {
  const { today } = useData();
  const [mode, setMode] = useState<CalMode>(initial);
  const [anchor, setAnchor] = useState(today);
  return { mode, setMode, anchor, setAnchor };
}

export function CalendarModeSeg({ mode, setMode, modes = ['day', 'week', 'weekTime', 'month', 'year'] }: { mode: CalMode; setMode: (m: CalMode) => void; modes?: CalMode[] }) {
  const { t } = useData();
  const label: Record<CalMode, string> = { day: t('cal_day'), week: t('cal_week'), weekTime: t('cal_weekTime'), month: t('cal_month'), year: t('cal_year') };
  return <Seg value={mode} onChange={setMode} options={modes.map((m) => ({ v: m, l: label[m] }))} />;
}

export function CalendarNav({ mode, anchor, setAnchor }: { mode: CalMode; anchor: string; setAnchor: (k: string) => void }) {
  const { t, today, prefs } = useData();
  const d = fromKey(anchor);
  const step = (dir: 1 | -1) => {
    if (mode === 'day') return setAnchor(addDays(anchor, dir));
    if (mode === 'week' || mode === 'weekTime') return setAnchor(addDays(anchor, 7 * dir));
    if (mode === 'month') return setAnchor(addMonths(anchor, dir));
    setAnchor(`${d.getFullYear() + dir}${anchor.slice(4)}`);
  };
  let label = `${t.months[d.getMonth()]} ${d.getFullYear()}`;
  if (mode === 'day') label = `${d.getDate()} ${t.months[d.getMonth()]} ${d.getFullYear()}, ${t.dow[weekdayIndex(anchor, true)]}`;
  if (mode === 'week' || mode === 'weekTime') {
    const ws = startOfWeek(anchor, prefs.weekStartsMonday);
    const we = fromKey(addDays(ws, 6));
    label = `${fromKey(ws).getDate()} ${t.months[fromKey(ws).getMonth()].slice(0, 3)} – ${we.getDate()} ${t.months[we.getMonth()].slice(0, 3)} ${we.getFullYear()} · ${t('perf_week')} ${isoWeek(ws)}`;
  }
  if (mode === 'year') label = String(d.getFullYear());
  return (
    <div className="row" style={{ marginBottom: 10 }}>
      <b style={{ flex: 1, minWidth: 0 }}>{label}</b>
      <button className="btn sm" onClick={() => step(-1)}>
        ‹
      </button>
      <button className="btn sm" onClick={() => setAnchor(today)}>
        {t('today')}
      </button>
      <button className="btn sm" onClick={() => step(1)}>
        ›
      </button>
    </div>
  );
}

export function CalendarView({ mode, anchor, setAnchor, setMode }: { mode: CalMode; anchor: string; setAnchor: (k: string) => void; setMode: (m: CalMode) => void }) {
  const { prefs } = useData();
  const openDay = (k: string) => {
    setAnchor(k);
    setMode('day');
  };
  if (mode === 'day') return <TimeGrid days={[anchor]} />;
  if (mode === 'weekTime') {
    const ws = startOfWeek(anchor, prefs.weekStartsMonday);
    return <TimeGrid days={range(ws, addDays(ws, 6))} onDayClick={openDay} />;
  }
  if (mode === 'year') return <YearView anchor={anchor} onMonth={(k) => (setAnchor(k), setMode('month'))} />;
  return <MonthWeekGrid mode={mode} anchor={anchor} onDayClick={openDay} />;
}

// ---------------------------------------------------------------------------
// Ay / hafta kartları
// ---------------------------------------------------------------------------
function MonthWeekGrid({ mode, anchor, onDayClick }: { mode: 'week' | 'month'; anchor: string; onDayClick: (k: string) => void }) {
  const { tasks, habits, idxOf, today, t, prefs, projects } = useData();
  const monday = prefs.weekStartsMonday;
  let days: string[];
  if (mode === 'week') {
    const ws = startOfWeek(anchor, monday);
    days = range(ws, addDays(ws, 6));
  } else {
    const first = startOfMonth(anchor);
    const ws = startOfWeek(first, monday);
    const last = addDays(addMonths(first, 1), -1);
    days = range(ws, addDays(startOfWeek(last, monday), 6));
  }
  const dow = monday ? t.dow : [t.dow[6], ...t.dow.slice(0, 6)];
  const month = anchor.slice(0, 7);
  const projColor = new Map(projects.map((p) => [p.id, p.color]));
  const active = habits.filter((h) => !h.archived);
  const max = mode === 'week' ? 8 : 3;
  const calRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ a: string; b: string } | null>(null);
  const anchorK = useRef<string | null>(null);
  useEffect(() => setSel(null), [days[0], days.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEscape(() => setSel(null), !!sel);
  useDragSelect(calRef, {
    isEmpty: (tg) => {
      const el = tg as HTMLElement | null;
      if (!el?.closest || el.closest('button, .ev, .sel-menu')) return false;
      return !!el.closest('.day');
    },
    pointAt: ({ x, y }) => ((document.elementFromPoint(x, y)?.closest('[data-day]') as HTMLElement | null)?.dataset.day ?? null),
    onStart: (k) => {
      anchorK.current = k;
      setSel({ a: k, b: k });
    },
    onMove: (k) => {
      const a = anchorK.current!;
      setSel(a < k ? { a, b: k } : { a: k, b: a });
    },
    onEnd: () => {},
  });
  const lastCol = (k: string) => days.indexOf(k) % 7 >= 5;
  return (
    <div className={'cal' + (sel ? ' selecting' : '')} ref={calRef}>
      {dow.map((d) => (
        <div key={d} className="h">
          {d}
        </div>
      ))}
      {days.map((k) => {
        const dayTasks = tasks.filter((x) => onDay(x, k)).sort((a, b) => (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99'));
        const inSel = !!sel && k >= sel.a && k <= sel.b;
        return (
          <div
            key={k}
            data-day={k}
            className={'day' + (k === today ? ' today' : '') + (mode === 'month' && !k.startsWith(month) ? ' other' : '') + (inSel ? ' sel' : '') + (sel?.b === k ? ' has-menu' : '')}
            style={mode === 'week' ? { minHeight: 140 } : undefined}
          >
            <div className="n">
              <button className="icon-btn add" aria-label={t('add_task')} onClick={() => openEditor({ kind: 'task', defaults: { dueDate: k } })}>
                +
              </button>
              <button className="link-title" onClick={() => onDayClick(k)}>
                <b>{fromKey(k).getDate()}</b>
              </button>
            </div>
            <div className="dots">
              {active.map((h) => {
                const d = idxOf(h.id).get(k);
                if (!d || d.count === 0) return null;
                return <i key={h.id} title={`${h.icon} ${h.name} ${d.count}/${d.total}`} style={d.complete ? { background: h.color } : { boxShadow: `inset 0 0 0 1.5px ${h.color}` }} />;
              })}
            </div>
            {dayTasks.slice(0, max).map((x) => {
              const cont = startOf(x)! < k;
              return (
                <div key={x.id} className={'ev' + (x.status === 'done' ? ' done' : '') + (cont ? ' cont' : '')} style={{ borderLeftColor: (x.projectId && projColor.get(x.projectId)) || undefined }} onClick={() => openEditor({ kind: 'task', id: x.id })} title={x.title}>
                  {cont ? '↳ ' : x.dueTime ? <span className="muted">{x.dueTime} </span> : null}
                  {x.title}
                </div>
              );
            })}
            {dayTasks.length > max && (
              <button className="link-title small muted" onClick={() => onDayClick(k)}>
                +{dayTasks.length - max}
              </button>
            )}
            {sel?.b === k && (
              <SelMenu
                right={lastCol(k)}
                label={sel.a === sel.b ? shortDate(sel.a, t) : `${shortDate(sel.a, t)} → ${shortDate(sel.b, t)} (${range(sel.a, sel.b).length} ${t('day_unit')})`}
                onTask={() => openEditor({ kind: 'task', defaults: { startDate: sel.a < sel.b ? sel.a : undefined, dueDate: sel.b } })}
                onHabit={() => openEditor({ kind: 'habit', defaults: habitDefaults(range(sel.a, sel.b)) })}
                onClose={() => setSel(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function shortDate(k: string, t: ReturnType<typeof useData>['t']) {
  const d = fromKey(k);
  return `${d.getDate()} ${t.months[d.getMonth()].slice(0, 3)} ${t.dow[weekdayIndex(k, true)]}`;
}

/** Seçilen günlerden alışkanlık varsayılanları: birden çok gün seçildiyse o haftanın günleri. */
function habitDefaults(keys: string[], time?: string) {
  const wd = [...new Set(keys.map((k) => weekdayIndex(k, true)))].sort();
  return { reminderTime: time, days: keys.length > 1 && wd.length < 7 ? wd : undefined };
}

function useEscape(f: () => void, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !editorOpen() && f();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [on, f]);
}

/** Seçimin altında açılan menü: seçime art arda görev/alışkanlık eklenebilir; seçim kendiliğinden kaybolmaz. */
function SelMenu({ label, onTask, onHabit, onClose, right, style }: { label: string; onTask: () => void; onHabit: () => void; onClose: () => void; right?: boolean; style?: React.CSSProperties }) {
  const { t } = useData();
  return (
    <div className={'sel-menu' + (right ? ' right' : '')} style={style} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      <div className="small muted">{label}</div>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <button className="btn sm primary" onClick={onTask}>
          ＋ {t('sel_task')}
        </button>
        <button className="btn sm" onClick={onHabit}>
          ＋ {t('sel_habit')}
        </button>
        <button className="icon-btn" aria-label="✕" title={t('sel_clear')} onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saat ızgarası (gün ve saatli hafta)
// ---------------------------------------------------------------------------
const HOUR = 44; // px

interface Ev {
  id: string;
  start: number; // gün içi dakika
  end: number;
  title: string;
  sub?: string;
  color: string;
  kind: 'task' | 'slot' | 'habit' | 'focus';
  done?: boolean;
  missed?: boolean;
  onClick?: () => void;
}
type LaidEv = Ev & { lane: number; lanes: number };
interface Chip {
  id: string;
  label: string;
  color: string;
  done?: boolean;
  onClick: () => void;
}

function useDayEvents(days: string[]) {
  const { tasks, habits, idxOf, focus, projects, today } = useData();
  return useMemo(() => {
    const nowHm = timeOfTs(Date.now());
    const projColor = new Map(projects.map((p) => [p.id, p.color]));
    const out = new Map<string, { evs: LaidEv[]; chips: Chip[] }>();
    for (const k of days) {
      const evs: Ev[] = [];
      const chips: Chip[] = [];
      for (const x of tasks) {
        if (!onDay(x, k)) continue;
        const color = (x.projectId && projColor.get(x.projectId)) || 'var(--accent)';
        const open = () => openEditor({ kind: 'task', id: x.id });
        if (x.dueTime) {
          const s = hmToMin(x.dueTime);
          evs.push({ id: x.id, start: s, end: s + (x.duration ?? 30), title: x.title, sub: `${x.dueTime}–${minToHm(s + (x.duration ?? 30))}`, color, kind: 'task', done: x.status === 'done', onClick: open });
        } else chips.push({ id: x.id, label: '📄 ' + x.title, color, done: x.status === 'done', onClick: open });
      }
      for (const h of habits) {
        if (h.archived || !isScheduled(h, k)) continue;
        const d = idxOf(h.id).get(k);
        if (isSlotted(h)) {
          const untimed = h.slots!.filter((s) => !s.time);
          for (const sl of h.slots!) {
            if (!sl.time) continue;
            const s = hmToMin(sl.time);
            const at = d?.slots.get(sl.id);
            const done = !!d?.slots.has(sl.id);
            const missed = !done && (k < today || (k === today && sl.time < nowHm));
            evs.push({
              id: `${h.id}_${sl.id}`, start: s, end: s + 25, title: `${h.icon} ${sl.name}`,
              sub: done ? `✓ ${at ? timeOfTs(at) : ''}` : sl.time, color: h.color, kind: 'slot', done, missed,
              onClick: () => void toggleHabit(h.id, k, sl.id),
            });
          }
          if (untimed.length)
            chips.push({ id: h.id, label: `${h.icon} ${h.name} ${d?.count ?? 0}/${h.slots!.length}`, color: h.color, done: d?.complete, onClick: () => openEditor({ kind: 'habitDay', id: h.id, date: k }) });
        } else if (h.reminderTime) {
          const s = hmToMin(h.reminderTime);
          const done = !!d?.complete;
          evs.push({
            id: h.id, start: s, end: s + 25, title: `${h.icon} ${h.name}`, sub: done ? `✓ ${d?.at ? timeOfTs(d.at) : ''}` : h.reminderTime,
            color: h.color, kind: 'habit', done, missed: !done && (k < today || (k === today && h.reminderTime < nowHm)),
            onClick: () => void toggleHabit(h.id, k),
          });
        } else {
          chips.push({ id: h.id, label: `${h.icon} ${h.name}`, color: h.color, done: d?.complete, onClick: () => void toggleHabit(h.id, k) });
        }
      }
      for (const f of focus) {
        if (f.date !== k) continue;
        const s = hmToMin(timeOfTs(f.start));
        evs.push({ id: f.id, start: s, end: s + f.minutes, title: '⏱️', sub: `${f.minutes} dk`, color: 'var(--green)', kind: 'focus', done: true });
      }
      out.set(k, { evs: layout(evs), chips });
    }
    return out;
  }, [days.join(','), tasks, habits, idxOf, focus, projects, today]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Çakışan etkinlikleri yan yana şeritlere yerleştirir. */
function layout(evs: Ev[]): LaidEv[] {
  const sorted = [...evs].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (Ev & { lane: number; lanes: number })[] = [];
  let cluster: (Ev & { lane: number; lanes: number })[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const e of cluster) e.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const e of sorted) {
    const end = Math.max(e.end, e.start + 20);
    if (e.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((x) => x <= e.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else laneEnds[lane] = end;
    cluster.push({ ...e, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}

function TimeGrid({ days, onDayClick }: { days: string[]; onDayClick?: (k: string) => void }) {
  const { t, today } = useData();
  const data = useDayEvents(days);
  const scroller = useRef<HTMLDivElement>(null);
  const [nowMin, setNowMin] = useState(() => hmToMin(timeOfTs(Date.now())));
  useEffect(() => {
    const id = setInterval(() => setNowMin(hmToMin(timeOfTs(Date.now()))), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    // ilk açılışta: bugün görünüyorsa şu andan 1 saat öncesine, değilse 06:30'a kaydır
    const target = days.includes(today) ? Math.max(0, nowMin - 60) : 390;
    scroller.current?.scrollTo({ top: (target / 60) * HOUR });
  }, [days[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = `44px repeat(${days.length}, minmax(0, 1fr))`;
  const anyChips = days.some((k) => data.get(k)!.chips.length);

  // ---- sürükleyerek seçim ----
  const bodyRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [sel, setSel] = useState<{ d0: number; d1: number; m0: number; m1: number } | null>(null);
  const anchor = useRef<{ d: number; m: number } | null>(null);
  useEffect(() => setSel(null), [days.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEscape(() => setSel(null), !!sel);
  const minAt = (d: number, y: number, round = false) => {
    const r = colRefs.current[d]!.getBoundingClientRect();
    const raw = ((y - r.top) / HOUR) * 60;
    return Math.max(0, Math.min(24 * 60, (round ? Math.round(raw / 15) : Math.floor(raw / 15)) * 15));
  };
  useDragSelect(bodyRef, {
    isEmpty: (tg) => tg instanceof HTMLElement && tg.classList.contains('tg-col'),
    pointAt: ({ x, y }) => {
      const cs = colRefs.current.filter(Boolean) as HTMLDivElement[];
      if (!cs.length) return null;
      let d = cs.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return x >= r.left && x < r.right;
      });
      if (d < 0) d = x < cs[0].getBoundingClientRect().left ? 0 : cs.length - 1;
      return { d, m: Math.min(24 * 60 - 15, minAt(d, y)) };
    },
    onStart: (p) => {
      anchor.current = p;
      setSel({ d0: p.d, d1: p.d, m0: p.m, m1: p.m + 15 });
    },
    onMove: (p) => {
      const a = anchor.current!;
      setSel({ d0: Math.min(a.d, p.d), d1: Math.max(a.d, p.d), m0: Math.min(a.m, p.m), m1: Math.max(a.m, p.m) + 15 });
    },
    onEnd: (moved) => {
      if (moved) return;
      const a = anchor.current!;
      const m0 = Math.floor(a.m / 30) * 30;
      setSel({ d0: a.d, d1: a.d, m0, m1: Math.min(24 * 60, m0 + 60) });
    },
  });
  const resize = (edge: 'top' | 'bottom') => (e: React.PointerEvent) => {
    if (!sel) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const d = sel.d0;
    const mv = (ev: PointerEvent) => {
      const m = minAt(d, ev.clientY, true);
      setSel((s) => s && (edge === 'top' ? { ...s, m0: Math.min(m, s.m1 - 15) } : { ...s, m1: Math.max(m, s.m0 + 15) }));
    };
    const up = () => {
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const selDays = sel ? days.slice(sel.d0, sel.d1 + 1) : [];
  const selLabel = sel
    ? `${selDays.length > 1 ? `${t.dow[weekdayIndex(selDays[0], true)]}–${t.dow[weekdayIndex(selDays[selDays.length - 1], true)]} · ` : days.length > 1 ? t.dow[weekdayIndex(selDays[0], true)] + ' · ' : ''}${minToHm(sel.m0)}–${sel.m1 >= 1440 ? '24:00' : minToHm(sel.m1)} (${sel.m1 - sel.m0} ${t('min_short')})`
    : '';

  return (
    <div className="tg">
      {days.length > 1 && (
        <div className="tg-head" style={{ gridTemplateColumns: cols }}>
          <div />
          {days.map((k) => (
            <button key={k} className={'tg-dh' + (k === today ? ' today' : '')} onClick={() => onDayClick?.(k)}>
              <span>{t.dow[weekdayIndex(k, true)]}</span>
              <b>{fromKey(k).getDate()}</b>
            </button>
          ))}
        </div>
      )}
      {anyChips && (
        <div className="tg-allday" style={{ gridTemplateColumns: cols }}>
          <div className="tg-gut small muted">{t('all_day')}</div>
          {days.map((k) => (
            <div key={k} className="tg-chips">
              {data.get(k)!.chips.map((c) => (
                <button key={c.id} className={'tg-chip' + (c.done ? ' done' : '')} style={{ borderLeftColor: c.color }} onClick={c.onClick} title={c.label}>
                  {c.done ? '✓ ' : ''}
                  {c.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="tg-scroll" ref={scroller}>
        <div className={'tg-body' + (sel ? ' selecting' : '')} ref={bodyRef} style={{ gridTemplateColumns: cols, height: 24 * HOUR }}>
          <div className="tg-gut">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * HOUR }}>
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((k, di) => (
            <div key={k} className={'tg-col' + (sel && di === sel.d0 ? ' has-menu' : '')} ref={(el) => void (colRefs.current[di] = el)} style={{ backgroundSize: `100% ${HOUR}px` }}>
              {data.get(k)!.evs.map((e) => (
                <button
                  key={e.id}
                  className={`tg-ev ${e.kind}` + (e.done ? ' done' : '') + (e.missed ? ' missed' : '') + (e.end - e.start < 40 ? ' short' : '')}
                  style={{
                    top: (e.start / 60) * HOUR,
                    height: Math.max(18, ((e.end - e.start) / 60) * HOUR - 2),
                    left: `calc(${(e.lane / e.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / e.lanes}% - 4px)`,
                    ['--c' as string]: e.color,
                  }}
                  onClick={e.onClick}
                  title={`${e.title} ${e.sub ?? ''}`}
                >
                  <span className="tg-t">{e.title}</span>
                  {e.sub && <span className="tg-s">{e.sub}</span>}
                </button>
              ))}
              {k === today && <div className="tg-now" style={{ top: (nowMin / 60) * HOUR }} />}
              {sel && di >= sel.d0 && di <= sel.d1 && (
                <div className="tg-sel" style={{ top: (sel.m0 / 60) * HOUR, height: ((sel.m1 - sel.m0) / 60) * HOUR }}>
                  {di === sel.d0 && (
                    <>
                      <span className="tg-sel-h top" onPointerDown={resize('top')} />
                      <span className="tg-sel-t">
                        {minToHm(sel.m0)}–{sel.m1 >= 1440 ? '24:00' : minToHm(sel.m1)}
                      </span>
                      <span className="tg-sel-h bottom" onPointerDown={resize('bottom')} />
                    </>
                  )}
                </div>
              )}
              {sel && di === sel.d0 && (
                <SelMenu
                  right={days.length > 2 && di >= days.length - 2}
                  style={{ top: (Math.min(sel.m1, 22 * 60) / 60) * HOUR + 6 }}
                  label={selLabel}
                  onTask={() =>
                    openEditor({
                      kind: 'task',
                      defaults: { startDate: selDays.length > 1 ? selDays[0] : undefined, dueDate: selDays[selDays.length - 1], dueTime: minToHm(sel.m0), duration: sel.m1 - sel.m0 },
                    })
                  }
                  onHabit={() => openEditor({ kind: 'habit', defaults: habitDefaults(selDays, minToHm(sel.m0)) })}
                  onClose={() => setSel(null)}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Yıl görünümü: 12 ay, gün başına XP yoğunluğu
// ---------------------------------------------------------------------------
function YearView({ anchor, onMonth }: { anchor: string; onMonth: (k: string) => void }) {
  const { t, xpDay, today, prefs } = useData();
  const year = anchor.slice(0, 4);
  const max = Math.max(10, ...[...xpDay.entries()].filter(([k]) => k.startsWith(year)).map(([, v]) => v));
  const dow = prefs.weekStartsMonday ? t.dow : [t.dow[6], ...t.dow.slice(0, 6)];
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, m) => {
        const first = `${year}-${String(m + 1).padStart(2, '0')}-01`;
        const lead = weekdayIndex(first, prefs.weekStartsMonday);
        const n = daysInMonth(first);
        let monthXp = 0;
        return (
          <button key={m} className="year-month" onClick={() => onMonth(first)}>
            <div className="ym-title">{t.months[m]}</div>
            <div className="mini-month">
              {dow.map((d) => (
                <div key={d} className="c blank small muted">
                  {d[0]}
                </div>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <div key={'b' + i} className="c blank" />
              ))}
              {Array.from({ length: n }, (_, i) => {
                const k = first.slice(0, 8) + String(i + 1).padStart(2, '0');
                const v = xpDay.get(k) ?? 0;
                monthXp += v;
                const lvl = v ? Math.ceil((v / max) * 4) : 0;
                return (
                  <div key={k} className={'c' + (k === today ? ' today' : '') + (k > today ? ' future' : '')} style={lvl ? { background: `rgba(var(--accent-rgb), ${0.2 + lvl * 0.2})`, color: lvl > 2 ? '#fff' : undefined } : undefined}>
                    {i + 1}
                  </div>
                );
              })}
            </div>
            <div className="small muted">{monthXp} XP</div>
          </button>
        );
      })}
    </div>
  );
}
