// Alışkanlık detayı (yıllara göre geçmiş), gün düzenleyici (bölümler) ve kaçırılanlar listesi.
import { useMemo, useState } from 'react';
import { setAllSlots, setHabitDone } from '../lib/actions';
import { addDays, addMonths, fromKey, hmToMin, keyOfTs, minToHm, range, startOfWeek, timeOfTs, todayKey, weekdayIndex } from '../lib/dates';
import { isScheduled, isSlotted, missedFor, type MissedItem } from '../lib/logic';
import { useData, type AppData } from '../lib/store';
import { cellStyle, SlotChecklist, useHabitStats } from './blocks';
import { openEditor } from './Editors';
import { Modal, Seg, toast } from './ui';

const close = () => openEditor(null);

export function fmtDate(key: string, t: AppData['t'], withDow = true) {
  const d = fromKey(key);
  const dow = t.dow[weekdayIndex(key, true)];
  return `${d.getDate()} ${t.months[d.getMonth()]} ${d.getFullYear()}${withDow ? `, ${dow}` : ''}`;
}

// ---------------------------------------------------------------------------
// Gün düzenleyici: bölümlü alışkanlığın herhangi bir gününü işaretle
// ---------------------------------------------------------------------------
export function HabitDayEditor({ id, date }: { id: string; date: string }) {
  const { habits, t, idxOf } = useData();
  const h = habits.find((x) => x.id === id);
  if (!h) return null;
  const d = idxOf(h.id).get(date);
  return (
    <Modal title={`${h.icon} ${h.name}`} onClose={close}>
      <p className="muted" style={{ marginTop: -8 }}>
        {fmtDate(date, t)} · {d?.count ?? 0}/{h.slots?.length ?? 1}
      </p>
      {isSlotted(h) && <SlotChecklist h={h} date={date} />}
      <div className="actions">
        <button className="btn left" onClick={() => setAllSlots(h, date, false)}>
          ✕ {t('h_clearAll')}
        </button>
        <button className="btn" onClick={() => setAllSlots(h, date, true)}>
          ✓ {t('h_checkAll')}
        </button>
        <button className="btn primary" onClick={close}>
          {t('done_btn')}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Alışkanlık detayı: yıl yıl geçmiş, aylık oran, bölüm başarıları, son kayıtlar, kaçırılanlar
// ---------------------------------------------------------------------------
export function HabitDetail({ id }: { id: string }) {
  const { habits } = useData();
  const h = habits.find((x) => x.id === id);
  return h ? <HabitDetailInner h={h} /> : null;
}

function HabitDetailInner({ h }: { h: AppData['habits'][number] }) {
  const { t, today, prefs } = useData();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [tab, setTab] = useState<'history' | 'missed'>('history');
  const { idx, s } = useHabitStats(h);
  const createdYear = new Date(h.createdAt).getFullYear();
  const firstLogYear = Math.min(createdYear, ...[...idx.keys()].map((k) => Number(k.slice(0, 4))));
  const thisYear = Number(today.slice(0, 4));

  return (
    <Modal title={`${h.icon} ${h.name}`} onClose={close} wide>
      <div className="row" style={{ marginTop: -6, marginBottom: 12 }}>
        <Seg value={tab} onChange={setTab} options={[{ v: 'history', l: '📅 ' + t('h_history') }, { v: 'missed', l: '⚠️ ' + t('tab_missed') }]} />
        <div style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => openEditor({ kind: 'habit', id: h.id })}>
          ✎ {t('edit')}
        </button>
      </div>

      {tab === 'missed' ? (
        <MissedList habitId={h.id} />
      ) : (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
            <Kpi v={`🔥 ${s.streak}`} l={`${t('streak')} (${t(s.unit === 'day' ? 'day_unit' : 'week_unit')})`} />
            <Kpi v={`🏆 ${s.maxStreak}`} l={t('max')} />
            <Kpi v={String(s.totalDone)} l={t('h_totalDays')} />
            <Kpi v={`${Math.round(s.rate30 * 100)}%`} l={t('rate30')} />
            {s.minutes > 0 && <Kpi v={`${s.minutes}`} l={t('minutes')} />}
          </div>

          <div className="month-nav" style={{ justifyContent: 'center', marginBottom: 8 }}>
            <button className="icon-btn" disabled={year <= firstLogYear} onClick={() => setYear(year - 1)}>
              ‹
            </button>
            <b style={{ minWidth: 60, textAlign: 'center' }}>{year}</b>
            <button className="icon-btn" disabled={year >= thisYear} onClick={() => setYear(year + 1)}>
              ›
            </button>
          </div>
          <YearHeat h={h} year={year} monday={prefs.weekStartsMonday} />
          <YearSummary h={h} year={year} />
          {isSlotted(h) && <SlotRates h={h} year={year} />}
          <RecentLog h={h} />
        </>
      )}
    </Modal>
  );
}

function Kpi({ v, l }: { v: string; l: string }) {
  return (
    <div className="kpi" style={{ padding: 10 }}>
      <div className="v" style={{ fontSize: 20 }}>
        {v}
      </div>
      <div className="l">{l}</div>
    </div>
  );
}

function YearHeat({ h, year, monday }: { h: AppData['habits'][number]; year: number; monday: boolean }) {
  const { idxOf, t, today } = useData();
  const idx = idxOf(h.id);
  const start = startOfWeek(`${year}-01-01`, monday);
  const end = `${year}-12-31`;
  const days = range(start, end);
  // ay etiketleri: her ayın ilk gününün düştüğü sütun
  const labels: { col: number; m: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const k = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    labels.push({ col: Math.floor(days.indexOf(k) / 7), m });
  }
  const cols = Math.ceil(days.length / 7);
  return (
    <div className="year-heat-wrap">
      <div className="year-labels" style={{ gridTemplateColumns: `repeat(${cols}, 12px)` }}>
        {labels.map((l) => (
          <span key={l.m} style={{ gridColumn: l.col + 1 }}>
            {t.months[l.m].slice(0, 3)}
          </span>
        ))}
      </div>
      <div className="heat">
        {days.map((k) => {
          const inYear = k.startsWith(String(year));
          const d = idx.get(k);
          return (
            <i
              key={k}
              title={`${fmtDate(k, t)}${d ? ` · ${d.count}/${d.total}` : ''}`}
              className={(inYear ? '' : 'out') + (k > today ? ' fut' : '') + (inYear && !isScheduled(h, k) ? ' off' : '')}
              style={inYear ? cellStyle(h, d) : undefined}
              onClick={() => inYear && k <= today && (isSlotted(h) ? openEditor({ kind: 'habitDay', id: h.id, date: k }) : setHabitDone(h.id, k, !d?.complete))}
            />
          );
        })}
      </div>
    </div>
  );
}

function YearSummary({ h, year }: { h: AppData['habits'][number]; year: number }) {
  const { idxOf, t, today } = useData();
  const idx = idxOf(h.id);
  const created = keyOfTs(h.createdAt);
  const months = Array.from({ length: 12 }, (_, m) => {
    const prefix = `${year}-${String(m + 1).padStart(2, '0')}`;
    const first = `${prefix}-01`;
    const last = addDays(addMonths(first, 1), -1);
    const from = first < created ? created : first;
    const to = last > today ? today : last;
    let expected = 0;
    let done = 0;
    if (from <= to) {
      for (const k of range(from, to)) {
        if (!isScheduled(h, k)) continue;
        expected += h.days?.length ? 1 : Math.min(7, h.weeklyTarget) / 7;
      }
      for (const [k, d] of idx) if (k.startsWith(prefix)) done += Math.min(1, d.count / d.total);
    }
    return { m, rate: expected ? Math.min(1, done / expected) : null, done };
  });
  return (
    <div style={{ margin: '14px 0' }}>
      <h4 className="small muted" style={{ margin: '0 0 6px' }}>
        {t('h_monthly')} — {year}
      </h4>
      <div className="month-bars">
        {months.map((x) => (
          <div key={x.m} className="mb" title={x.rate === null ? '—' : `${Math.round(x.rate * 100)}%`}>
            <div className="mb-track">
              <i style={{ height: `${(x.rate ?? 0) * 100}%`, background: h.color }} />
            </div>
            <span>{t.months[x.m].slice(0, 3)}</span>
            <b>{x.rate === null ? '—' : `${Math.round(x.rate * 100)}`}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotRates({ h, year }: { h: AppData['habits'][number]; year: number }) {
  const { idxOf, t, today } = useData();
  const idx = idxOf(h.id);
  const created = keyOfTs(h.createdAt);
  const from = `${year}-01-01` < created ? created : `${year}-01-01`;
  const to = `${year}-12-31` > today ? today : `${year}-12-31`;
  const days = from <= to ? range(from, to).filter((k) => isScheduled(h, k)) : [];
  return (
    <div style={{ marginBottom: 14 }}>
      <h4 className="small muted" style={{ margin: '0 0 6px' }}>
        {t('h_slotRates')} — {year}
      </h4>
      {h.slots!.map((sl) => {
        let n = 0;
        let minutes = 0;
        let timed = 0;
        for (const k of days) {
          const at = idx.get(k)?.slots.get(sl.id);
          if (idx.get(k)?.slots.has(sl.id)) n++;
          if (at && keyOfTs(at) === k) {
            minutes += hmToMin(timeOfTs(at));
            timed++;
          }
        }
        const rate = days.length ? n / days.length : 0;
        return (
          <div key={sl.id} className="progress-row" style={{ marginBottom: 4 }}>
            <span style={{ width: 90, flexShrink: 0 }}>
              {sl.name} {sl.time && <span className="muted small">{sl.time}</span>}
            </span>
            <div className="bar">
              <i style={{ width: `${rate * 100}%`, background: h.color }} />
            </div>
            <span className="small" style={{ width: 120, textAlign: 'right' }}>
              {n}/{days.length} · {timed ? `⌀ ${minToHm(minutes / timed)}` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RecentLog({ h }: { h: AppData['habits'][number] }) {
  const { logs, t } = useData();
  const [n, setN] = useState(20);
  const slotName = new Map((h.slots ?? []).map((s) => [s.id, s]));
  const rows = useMemo(
    () => logs.filter((l) => l.habitId === h.id && l.done && (!l.slotId || slotName.has(l.slotId))).sort((a, b) => b.date.localeCompare(a.date) || (b.at ?? 0) - (a.at ?? 0)),
    [logs, h], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <div>
      <h4 className="small muted" style={{ margin: '0 0 6px' }}>
        {t('h_recent')}
      </h4>
      <div className="log-list">
        {rows.slice(0, n).map((l) => {
          const late = l.at && keyOfTs(l.at) !== l.date;
          return (
            <div key={l.id} className="log-row">
              <span>{fmtDate(l.date, t)}</span>
              <span className="muted">{l.slotId ? slotName.get(l.slotId)?.name : ''}</span>
              <span style={{ marginLeft: 'auto' }} className={late ? '' : 'muted'}>
                {l.at ? (late ? `⏱ ${t('late')}: ${fmtDate(keyOfTs(l.at), t, false)} ${timeOfTs(l.at)}` : `✓ ${timeOfTs(l.at)}`) : '✓'}
              </span>
            </div>
          );
        })}
        {rows.length === 0 && <div className="empty">—</div>}
      </div>
      {rows.length > n && (
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setN(n + 50)}>
          {t('more_items')}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kaçırılanlar: tarih + planlanan saat ile, telafi edilebilir
// ---------------------------------------------------------------------------
type RangeKey = 7 | 30 | 90 | 365 | 0;

export function useMissed(range: RangeKey, habitId?: string) {
  const { habits, idxOf, today, prefs } = useData();
  return useMemo(() => {
    const from = range ? addDays(today, -range) : '0000-01-01';
    const nowHm = timeOfTs(Date.now());
    const list: MissedItem[] = [];
    for (const h of habits) {
      if (h.archived && h.id !== habitId) continue;
      if (habitId && h.id !== habitId) continue;
      list.push(...missedFor(h, idxOf(h.id), from, today, nowHm, prefs.weekStartsMonday));
    }
    return list.sort((a, b) => b.date.localeCompare(a.date) || (a.time ?? '99').localeCompare(b.time ?? '99'));
  }, [habits, idxOf, today, prefs.weekStartsMonday, range, habitId]);
}

export function MissedList({ habitId }: { habitId?: string }) {
  const { t, habits } = useData();
  const [rangeKey, setRange] = useState<RangeKey>(30);
  const [filter, setFilter] = useState(habitId ?? '');
  const [limit, setLimit] = useState(150);
  const items = useMissed(rangeKey, filter || undefined);

  const groups = useMemo(() => {
    const m = new Map<string, MissedItem[]>();
    for (const it of items.slice(0, limit)) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    return [...m.entries()];
  }, [items, limit]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Seg<RangeKey>
          value={rangeKey}
          onChange={setRange}
          options={[
            { v: 7, l: t('range_7') },
            { v: 30, l: t('range_30') },
            { v: 90, l: t('range_90') },
            { v: 365, l: t('range_365') },
            { v: 0, l: t('range_all') },
          ]}
        />
        {!habitId && (
          <select className="input" style={{ maxWidth: 240 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{t('all_habits')}</option>
            {habits.filter((h) => !h.archived).map((h) => (
              <option key={h.id} value={h.id}>
                {h.icon} {h.name}
              </option>
            ))}
          </select>
        )}
        <span className="badge red">{t('missed_count', { n: items.length })}</span>
      </div>
      {items.length === 0 && <div className="empty">{t('missed_none')}</div>}
      {groups.map(([date, list]) => (
        <div key={date} className="missed-group">
          <div className="missed-date">{list[0].kind === 'week' ? t('week_of', { d: fmtDate(date, t, false) }) : fmtDate(date, t)}</div>
          {list.map((it) => (
            <div key={`${it.habit.id}_${it.date}_${it.slot?.id ?? ''}`} className="task-row">
              <span style={{ fontSize: 18 }}>{it.habit.icon}</span>
              <div className="t">
                <div className="title">
                  {it.habit.name}
                  {it.slot && <span style={{ color: it.habit.color }}> · {it.slot.name}</span>}
                </div>
                <div className="meta">
                  {it.time && <span>⏰ {it.time}</span>}
                  {it.kind === 'week' && <span>{t('week_missed', { done: it.done ?? 0, target: it.target ?? 0 })}</span>}
                  {it.kind === 'slot' && (it.partial ?? 0) > 0 && (
                    <span>
                      ◐ {it.partial}/{it.habit.slots!.length}
                    </span>
                  )}
                </div>
              </div>
              {it.kind !== 'week' && (
                <button
                  className="btn sm"
                  onClick={async () => {
                    await setHabitDone(it.habit.id, it.date, true, it.slot?.id);
                    toast(`${it.habit.icon} ${t('made_up')}`);
                  }}
                >
                  ✓ {t('make_up')}
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {items.length > limit && (
        <button className="btn sm" onClick={() => setLimit(limit + 300)}>
          {t('more_items')} ({items.length - limit})
        </button>
      )}
    </div>
  );
}

export const missedYesterday = (items: MissedItem[]) => items.filter((x) => x.date === addDays(todayKey(), -1)).length;
