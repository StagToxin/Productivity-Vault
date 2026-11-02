// Odak: önceden hazırlanabilen pomodoro planı + kronometre.
import { useMemo, useState } from 'react';
import { segLabel, openPip } from '../components/MiniTimer';
import { Field, Modal, Seg, Switch, toast } from '../components/ui';
import { deleteFocusPlan, logFocus, saveFocusPlan, updatePrefs } from '../lib/actions';
import { uid } from '../lib/db';
import { minToHm } from '../lib/dates';
import { BLOCK_MAX, BLOCK_MIN, buildPlan, defaultPlan, planTotals, type Seg as PSeg } from '../lib/plan';
import { canPip, isTauri, openMiniWindow } from '../lib/platform';
import { useData } from '../lib/store';
import { fmtClock, timer, useTimer } from '../lib/timer';
import type { FocusPlan } from '../lib/types';

export default function FocusPage() {
  const { t, focus, today } = useData();
  const tm = useTimer();
  const [manual, setManual] = useState(false);
  const todays = focus.filter((f) => f.date === today);
  const tab = tm.mode;
  return (
    <div>
      <div className="page-head">
        <h1>⏱️ {t('nav_focus')}</h1>
        <div className="grow" />
        <Seg value={tab} onChange={(m) => timer.setMode(m)} options={[{ v: 'plan', l: '🍅 ' + t('pomodoro') }, { v: 'stopwatch', l: '⏱ ' + t('stopwatch') }]} />
      </div>
      <div className="section" style={{ maxWidth: 720, margin: '0 auto' }}>
        {tab === 'stopwatch' ? <Stopwatch /> : tm.active ? <RunningPlan /> : <PlanBuilder />}
        <hr className="sep" />
        <LinkSelects />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <div className="meta">
            ⏱ {t('focus_today')}: <b>{todays.reduce((s, f) => s + f.minutes, 0)}</b> {t('minutes')} · {todays.length} {t('sessions')}
          </div>
          <button className="btn sm" onClick={() => setManual(true)}>
            ＋ {t('log_manual')}
          </button>
        </div>
      </div>
      {manual && <ManualLog onClose={() => setManual(false)} />}
    </div>
  );
}

function openMini(auto: boolean, pref: boolean | undefined) {
  if (isTauri && (!auto || pref !== false)) void openMiniWindow();
}

// ---------------------------------------------------------------------------
function PlanBuilder() {
  const { t, prefs } = useData();
  const tm = useTimer();
  const saved = prefs.focusPlans ?? [];
  const [p, setP] = useState<FocusPlan>(() => saved[0] ?? defaultPlan({ focusMinutes: 45, shortBreak: 10, longBreak: 25 }));
  const set = (x: Partial<FocusPlan>) => setP((o) => ({ ...o, ...x }));
  const segs = useMemo(() => buildPlan(p), [p]);
  const tot = planTotals(segs);
  const now = new Date();
  const endHm = minToHm((now.getHours() * 60 + now.getMinutes() + tot.all) % (24 * 60));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const hrs = Math.floor(p.totalMin / 60);
  const mins = p.totalMin % 60;

  const start = () => {
    timer.startPlan(segs, { name: p.name || undefined, autoNext: p.autoNext, taskId: p.taskId ?? tm.taskId, habitId: p.habitId ?? tm.habitId });
    openMini(true, prefs.miniTimer);
  };
  const save = async () => {
    const plan = { ...p, id: p.id === 'quick' ? uid() : p.id, name: name.trim() || p.name || `${hrs ? hrs + t('hours') + ' ' : ''}${mins ? mins + t('min_short') : ''}`.trim() };
    await saveFocusPlan(plan);
    setP(plan);
    setNaming(false);
    toast('💾 ' + t('fc_saved'));
  };

  return (
    <div>
      {saved.length > 0 && (
        <div className="chip-row">
          <span className="small muted">{t('fc_saved_plans')}:</span>
          {saved.map((s) => (
            <span key={s.id} className={'chip' + (s.id === p.id ? ' active' : '')} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <button className="link-title" onClick={() => setP(s)}>
                {s.name}
              </button>
              <button className="icon-btn" style={{ padding: 0, width: 16, height: 16, fontSize: 10 }} aria-label={t('delete')} onClick={() => confirm(t('confirm_delete')) && void deleteFocusPlan(s.id)}>
                ✕
              </button>
            </span>
          ))}
          <button className="chip" onClick={() => setP(defaultPlan({ focusMinutes: 45, shortBreak: 10, longBreak: 25 }))}>
            ＋ {t('fc_new')}
          </button>
        </div>
      )}

      <div className="fc-grid">
        <Field label={t('fc_total')}>
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
            <input className="input" type="number" min={0} max={12} style={{ width: 70 }} value={hrs} onChange={(e) => set({ totalMin: Math.max(1, Number(e.target.value) * 60 + mins) })} />
            <span className="small">{t('hours')}</span>
            <input className="input" type="number" min={0} max={59} step={5} style={{ width: 70 }} value={mins} onChange={(e) => set({ totalMin: Math.max(1, hrs * 60 + Number(e.target.value)) })} />
            <span className="small">{t('min_short')}</span>
          </div>
          <div className="chip-row" style={{ marginTop: 6, marginBottom: 0 }}>
            {[25, 45, 60, 90, 120, 180, 240].map((m) => (
              <button type="button" key={m} className={'chip' + (p.totalMin === m ? ' active' : '')} onClick={() => set({ totalMin: m })}>
                {m < 60 ? `${m} ${t('min_short')}` : `${m / 60} ${t('hours')}`}
              </button>
            ))}
          </div>
        </Field>
        <div className="set-row">
          <div>
            {t('fc_noBreaks')}
            <div className="small muted">{t('fc_noBreaksHint')}</div>
          </div>
          <Switch on={p.noBreaks} onChange={(noBreaks) => set({ noBreaks })} />
        </div>
      </div>

      {!p.noBreaks && (
        <div className="fc-grid">
          <Slider label={t('fc_block')} value={p.blockMin} min={BLOCK_MIN} max={BLOCK_MAX} step={5} unit={t('min_short')} onChange={(blockMin) => set({ blockMin })} />
          <Slider label={t('short_break')} value={p.shortBreak} min={0} max={30} step={1} unit={t('min_short')} zero={t('none')} onChange={(shortBreak) => set({ shortBreak })} />
          <Slider label={t('long_break')} value={p.longBreak} min={0} max={60} step={5} unit={t('min_short')} zero={t('none')} onChange={(longBreak) => set({ longBreak })} />
          <Slider label={t('fc_longEvery')} value={p.longEvery} min={2} max={8} step={1} unit={t('fc_lessons')} onChange={(longEvery) => set({ longEvery })} disabled={!p.longBreak} />
          <Field label={t('fc_totalMeans')}>
            <Seg value={p.countBreaks ? 'all' : 'net'} options={[{ v: 'net', l: t('fc_net') }, { v: 'all', l: t('fc_withBreaks') }]} onChange={(v) => set({ countBreaks: v === 'all' })} />
          </Field>
          <div>
            <div className="set-row" style={{ padding: '2px 0' }}>
              <span className="small">{t('fc_equalize')}</span>
              <Switch on={p.equalize} onChange={(equalize) => set({ equalize })} />
            </div>
            <div className="set-row" style={{ padding: '2px 0' }}>
              <span className="small">{t('fc_autoNext')}</span>
              <Switch on={p.autoNext} onChange={(autoNext) => set({ autoNext })} />
            </div>
          </div>
        </div>
      )}

      <Timeline segs={segs} />
      <div className="small muted" style={{ textAlign: 'center', marginTop: 6 }}>
        {t('fc_summary', { b: tot.blocks, f: fmtMin(tot.focus, t), r: fmtMin(tot.breaks, t) })} · {t('fc_endsAt', { h: endHm })}
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
        <button className="btn primary" style={{ minWidth: 160 }} onClick={start}>
          ▶ {t('start')}
        </button>
        {naming ? (
          <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => (e.preventDefault(), void save())}>
            <input className="input" autoFocus placeholder={t('fc_planName')} value={name} onChange={(e) => setName(e.target.value)} style={{ width: 180 }} />
            <button className="btn">{t('save')}</button>
          </form>
        ) : (
          <button className="btn" onClick={() => (p.id !== 'quick' ? void save() : (setName(''), setNaming(true)))}>
            💾 {p.id !== 'quick' ? t('fc_update') : t('fc_savePlan')}
          </button>
        )}
      </div>
      {isTauri && (
        <div className="set-row" style={{ marginTop: 12 }}>
          <span className="small">{t('fc_miniAuto')}</span>
          <Switch on={prefs.miniTimer !== false} onChange={(miniTimer) => void updatePrefs({ miniTimer })} />
        </div>
      )}
    </div>
  );
}

const fmtMin = (m: number, t: ReturnType<typeof useData>['t']) => (m >= 60 ? `${Math.floor(m / 60)} ${t('hours')}${m % 60 ? ' ' + (m % 60) + ' ' + t('min_short') : ''}` : `${m} ${t('min_short')}`);

function Slider({ label, value, min, max, step, unit, zero, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; unit: string; zero?: string; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="field" style={disabled ? { opacity: 0.45 } : undefined}>
      <span>
        {label}: <b>{value === 0 && zero ? zero : `${value} ${unit}`}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Timeline({ segs, idx, pct = 0 }: { segs: PSeg[]; idx?: number; pct?: number }) {
  const { t } = useData();
  const total = segs.reduce((a, s) => a + s.min, 0) || 1;
  return (
    <div className="tl">
      {segs.map((s, i) => (
        <div
          key={i}
          className={`tl-s ${s.kind}` + (idx === i ? ' cur' : '') + (idx !== undefined && i < idx ? ' past' : '')}
          style={{ flexGrow: s.min, flexBasis: 0 }}
          title={`${s.kind === 'focus' ? t('lesson') : s.kind === 'long' ? t('long_break') : t('short_break')} · ${s.min} ${t('min_short')}`}
        >
          {idx === i && <i style={{ width: `${pct * 100}%` }} />}
          {(s.min / total) * 100 > 7 && <span>{s.min}</span>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
function RunningPlan() {
  const { t, prefs } = useData();
  const tm = useTimer();
  const pct = tm.total ? 1 - tm.left / tm.total : 0;
  const R = 110;
  const C = 2 * Math.PI * R;
  const isBreak = tm.seg?.kind !== 'focus';
  const color = isBreak ? 'var(--green)' : 'var(--accent)';
  const next = tm.segs[tm.idx + 1];
  const restMin = tm.segs.slice(tm.idx + 1).reduce((a, s) => a + s.min, 0);
  const endAt = new Date(Date.now() + tm.left + restMin * 60000);
  return (
    <div className="timer">
      <div className="small muted">{tm.planName ?? ''}</div>
      <b>{segLabel(tm, t)}</b>
      <div className="timer-ring">
        <svg width="240" height="240" viewBox="0 0 240 240">
          <circle cx="120" cy="120" r={R} fill="none" stroke="var(--cell)" strokeWidth="10" />
          <circle cx="120" cy="120" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <div className="time">{fmtClock(tm.left)}</div>
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn primary" style={{ minWidth: 120 }} onClick={() => (tm.running ? timer.pause() : timer.resume())}>
          {tm.running ? '⏸ ' + t('pause') : '▶ ' + t('resume')}
        </button>
        {isBreak ? (
          <button className="btn" onClick={() => timer.skip()}>
            ⏭ {t('skip_break')}
          </button>
        ) : (
          <button className="btn" onClick={() => confirm(t('fc_endLessonQ')) && timer.skip()}>
            ⏭ {t('fc_endLesson')}
          </button>
        )}
        <button className="btn" onClick={() => confirm(t('fc_stopQ')) && timer.stop()}>
          ⏹ {t('stop')}
        </button>
        {isTauri ? (
          <button className="btn" onClick={() => openMini(false, prefs.miniTimer)} title={t('fc_mini')}>
            ⧉ {t('fc_mini')}
          </button>
        ) : canPip ? (
          <button className="btn" onClick={() => void openPip()} title={t('fc_mini')}>
            ⧉ {t('fc_mini')}
          </button>
        ) : null}
      </div>
      <div style={{ width: '100%' }}>
        <Timeline segs={tm.segs} idx={tm.idx} pct={pct} />
      </div>
      <div className="small muted">
        {next ? t('fc_next', { s: next.kind === 'focus' ? t('lesson') : next.kind === 'long' ? t('long_break') : t('short_break'), m: next.min }) : t('fc_last')} · {t('fc_endsAt', { h: minToHm(endAt.getHours() * 60 + endAt.getMinutes()) })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Stopwatch() {
  const { t } = useData();
  const tm = useTimer();
  const running = !!tm.swStart;
  return (
    <div className="timer">
      <div className="time big-sw">{fmtClock(tm.sw, true)}</div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn primary" style={{ minWidth: 120 }} onClick={() => (running ? timer.pause() : timer.swStart())}>
          {running ? '⏸ ' + t('pause') : tm.sw ? '▶ ' + t('resume') : '▶ ' + t('start')}
        </button>
        <button
          className="btn"
          disabled={!tm.sw}
          onClick={() => {
            const m = timer.swFinish();
            if (m <= 0) toast(t('sw_tooShort')); // kaydedilince bildirimi ana döngü gösterir
          }}
        >
          ⏹ {t('sw_finish')}
        </button>
        <button className="btn" disabled={!tm.sw} onClick={() => confirm(t('sw_resetQ')) && timer.swReset()}>
          ↺ {t('reset')}
        </button>
        {isTauri ? (
          <button className="btn" onClick={() => void openMiniWindow()}>
            ⧉ {t('fc_mini')}
          </button>
        ) : canPip ? (
          <button className="btn" onClick={() => void openPip()}>
            ⧉ {t('fc_mini')}
          </button>
        ) : null}
      </div>
      <div className="small muted">{t('sw_hint')}</div>
    </div>
  );
}

function LinkSelects() {
  const { t, habits, tasks } = useData();
  const tm = useTimer();
  const linked = tasks.find((x) => x.id === tm.taskId);
  return (
    <>
      <div className="row">
        <Field label={t('link_to') + ' — ' + t('nav_tasks')}>
          <select className="input" value={tm.taskId ?? ''} onChange={(e) => timer.link({ taskId: e.target.value || undefined })}>
            <option value="">{t('none')}</option>
            {tasks.filter((x) => x.status !== 'done' || x.id === tm.taskId).map((x) => (
              <option key={x.id} value={x.id}>
                {x.rule?.focusMin ? '🍅 ' : ''}
                {x.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('link_to') + ' — ' + t('nav_habits')}>
          <select className="input" value={tm.habitId ?? ''} onChange={(e) => timer.link({ habitId: e.target.value || undefined })}>
            <option value="">{t('none')}</option>
            {habits.filter((h) => !h.archived).map((h) => (
              <option key={h.id} value={h.id}>
                {h.icon} {h.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {linked?.rule?.focusMin && <p className="small muted" style={{ marginTop: -4 }}>🍅 {t('fc_autoCheckHint', { n: linked.rule.focusMin })}</p>}
    </>
  );
}

function ManualLog({ onClose }: { onClose: () => void }) {
  const { t, habits, tasks } = useData();
  const [min, setMin] = useState(25);
  const [habitId, setHabitId] = useState('');
  const [taskId, setTaskId] = useState('');
  return (
    <Modal title={t('log_manual')} onClose={onClose}>
      <Field label={t('minutes')}>
        <input className="input" type="number" min={1} max={600} value={min} onChange={(e) => setMin(Number(e.target.value))} />
      </Field>
      <Field label={t('nav_tasks')}>
        <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
          <option value="">{t('none')}</option>
          {tasks.filter((x) => x.status !== 'done').map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('nav_habits')}>
        <select className="input" value={habitId} onChange={(e) => setHabitId(e.target.value)}>
          <option value="">{t('none')}</option>
          {habits.filter((h) => !h.archived).map((h) => (
            <option key={h.id} value={h.id}>
              {h.icon} {h.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="actions">
        <button className="btn" onClick={onClose}>
          {t('cancel')}
        </button>
        <button className="btn primary" onClick={async () => (await logFocus(min, { habitId: habitId || undefined, taskId: taskId || undefined }), onClose())}>
          {t('save')}
        </button>
      </div>
    </Modal>
  );
}
