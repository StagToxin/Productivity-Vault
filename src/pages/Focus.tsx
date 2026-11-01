import { useState } from 'react';
import { Field, Modal, Seg } from '../components/ui';
import { logFocus } from '../lib/actions';
import { useData } from '../lib/store';
import { durationFor, timer, useTimer, type Phase } from '../lib/timer';

export default function FocusPage() {
  const { t, prefs, habits, tasks, focus, today } = useData();
  const tm = useTimer();
  const [manual, setManual] = useState(false);
  const pct = tm.total ? 1 - tm.left / tm.total : 0;
  const mm = String(Math.floor(tm.left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((tm.left % 60000) / 1000)).padStart(2, '0');
  const R = 110;
  const C = 2 * Math.PI * R;
  const todays = focus.filter((f) => f.date === today);
  const color = tm.phase === 'focus' ? 'var(--accent)' : 'var(--green)';

  const setPhase = (p: Phase) => timer.setPhase(p, durationFor(p, prefs));
  const stopEarly = async () => {
    const m = timer.elapsedFocusMin();
    if (m > 0) await logFocus(m, { habitId: tm.habitId, taskId: tm.taskId });
    timer.reset(durationFor(tm.phase, prefs));
  };

  return (
    <div>
      <div className="page-head">
        <h1>⏱️ {t('nav_focus')}</h1>
      </div>
      <div className="section" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="timer">
          <Seg<Phase> value={tm.phase} onChange={setPhase} options={[{ v: 'focus', l: t('focus') }, { v: 'short', l: t('short_break') }, { v: 'long', l: t('long_break') }]} />
          <div className="timer-ring">
            <svg width="240" height="240" viewBox="0 0 240 240">
              <circle cx="120" cy="120" r={R} fill="none" stroke="var(--cell)" strokeWidth="10" />
              <circle cx="120" cy="120" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
            </svg>
            <div className="time">
              {mm}:{ss}
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" style={{ minWidth: 120 }} onClick={() => (tm.running ? timer.pause() : timer.start())}>
              {tm.running ? '⏸ ' + t('pause') : '▶ ' + t('start')}
            </button>
            <button className="btn" onClick={stopEarly}>
              ⏹ {t('reset')}
            </button>
            <button className="btn" onClick={() => setPhase(tm.phase === 'focus' ? 'short' : 'focus')}>
              ⏭ {t('skip')}
            </button>
          </div>
          <div className="small muted">
            🍅 × {tm.round % 4} / 4
          </div>
        </div>
        <div className="row">
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
          <Field label={t('link_to') + ' — ' + t('nav_tasks')}>
            <select className="input" value={tm.taskId ?? ''} onChange={(e) => timer.link({ taskId: e.target.value || undefined })}>
              <option value="">{t('none')}</option>
              {tasks.filter((x) => x.status !== 'done').map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
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

function ManualLog({ onClose }: { onClose: () => void }) {
  const { t, habits } = useData();
  const [min, setMin] = useState(25);
  const [habitId, setHabitId] = useState('');
  return (
    <Modal title={t('log_manual')} onClose={onClose}>
      <Field label={t('minutes')}>
        <input className="input" type="number" min={1} max={600} value={min} onChange={(e) => setMin(Number(e.target.value))} />
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
        <button className="btn primary" onClick={async () => (await logFocus(min, { habitId: habitId || undefined }), onClose())}>
          {t('save')}
        </button>
      </div>
    </Modal>
  );
}
