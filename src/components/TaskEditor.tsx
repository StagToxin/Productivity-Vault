import { useState } from 'react';
import { deleteTask, saveTask, uncheckTask } from '../lib/actions';
import { uid } from '../lib/db';
import { diffDays, timeOfTs } from '../lib/dates';
import { useData } from '../lib/store';
import { isTargeted, taskProgress } from '../lib/tasks';
import type { CheckItem, Priority, Task, TaskRepeat, TaskRule } from '../lib/types';
import { fmtDate } from './HabitViews';
import { Bar, Field, Modal, Seg, Switch } from './ui';

type GapMode = 'free' | 'day' | 'hours';

export function TaskEditor({ id, defaults, onClose }: { id?: string; defaults?: Partial<Task>; onClose: () => void }) {
  const { tasks, projects, t, today, checksOf } = useData();
  const cur = tasks.find((x) => x.id === id);
  const [f, setF] = useState<Partial<Task>>(cur ?? { title: '', notes: '', priority: 1, status: 'todo', dueDate: today, ...defaults });
  const set = (p: Partial<Task>) => setF((x) => ({ ...x, ...p }));
  const [multi, setMulti] = useState(!!(f.startDate && f.dueDate && f.startDate < f.dueDate));
  const [targeted, setTargeted] = useState(isTargeted(f as Task));
  const [repeatOn, setRepeatOn] = useState(!!f.repeat);
  const [listOn, setListOn] = useState(!!f.checklist?.length);
  const rule: TaskRule = f.rule ?? {};
  const gapMode: GapMode = rule.perDay ? 'day' : rule.gapHours ? 'hours' : 'free';
  const setRule = (p: Partial<TaskRule>) => set({ rule: { ...rule, ...p } });
  const repeat: TaskRepeat = f.repeat ?? { every: 1, unit: 'week' };
  const list: CheckItem[] = f.checklist ?? [];
  const mine = cur ? checksOf(cur.id) : [];

  const submit = async () => {
    if (!f.title?.trim()) return;
    const due = f.dueDate || undefined;
    const start = multi && f.startDate && due && f.startDate < due ? f.startDate : undefined;
    const cleanRule: TaskRule | undefined = targeted
      ? {
          perDay: gapMode === 'day' || undefined,
          gapHours: gapMode === 'hours' ? Math.min(24, Math.max(1, rule.gapHours ?? 6)) : undefined,
          focusMin: rule.focusMin && rule.focusMin > 0 ? rule.focusMin : undefined,
        }
      : undefined;
    const cleanList = listOn ? list.filter((c) => c.text.trim()).map((c) => ({ ...c, text: c.text.trim() })) : [];
    await saveTask({
      ...f,
      title: f.title.trim(),
      startDate: start,
      dueDate: due,
      dueTime: f.dueTime || undefined,
      reminderAt: f.reminderAt || undefined,
      projectId: f.projectId || undefined,
      target: targeted ? Math.max(2, Math.min(999, f.target ?? 3)) : undefined,
      rule: cleanRule && Object.values(cleanRule).some((v) => v !== undefined) ? cleanRule : undefined,
      repeat: repeatOn && due ? { every: Math.max(1, repeat.every), unit: repeat.unit } : undefined,
      checklist: cleanList.length ? cleanList : undefined,
    });
    onClose();
  };

  const p = cur ? taskProgress(cur, mine) : null;

  return (
    <Modal title={cur ? t('edit') : t('add_task')} onClose={onClose}>
      <form onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label={t('title')}>
          <input className="input" autoFocus value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="row">
          <Field label={t('project')}>
            <select className="input" value={f.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || undefined })}>
              <option value="">{t('none')}</option>
              {projects.filter((p) => p.status === 'active' || p.id === f.projectId).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('priority')}>
            <Seg<Priority> value={f.priority ?? 1} options={[0, 1, 2].map((n) => ({ v: n as Priority, l: t(`prio_${n}` as 'prio_0') }))} onChange={(priority) => set({ priority })} />
          </Field>
        </div>

        <div className="row" style={{ alignItems: 'flex-end' }}>
          {multi && (
            <Field label={t('start_date')}>
              <input className="input" type="date" value={f.startDate ?? ''} max={f.dueDate} onChange={(e) => set({ startDate: e.target.value })} />
            </Field>
          )}
          <Field label={multi ? t('end_date') : t('due_date')}>
            <input className="input" type="date" value={f.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value })} />
          </Field>
          <label className="field" style={{ flex: '0 0 auto' }}>
            <span>{t('multi_day')}</span>
            <Switch on={multi} onChange={(v) => (setMulti(v), v && !f.startDate && set({ startDate: today < (f.dueDate ?? today) ? today : f.dueDate }))} />
          </label>
        </div>
        {multi && f.startDate && f.dueDate && f.startDate < f.dueDate && <p className="small muted" style={{ marginTop: -6 }}>{t('spans_days', { n: diffDays(f.dueDate, f.startDate) + 1 })}</p>}

        <div className="row">
          <Field label={t('due_time')}>
            <input className="input" type="time" value={f.dueTime ?? ''} onChange={(e) => set({ dueTime: e.target.value })} />
          </Field>
          <Field label={t('duration')}>
            <select className="input" value={f.duration ?? 30} onChange={(e) => set({ duration: Number(e.target.value) })}>
              {[...new Set([15, 30, 45, 60, 90, 120, 180, 240, f.duration ?? 30])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m >= 60 ? `${Math.round((m / 60) * 10) / 10} ${t('hours')}` : `${m} ${t('minutes')}`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* ---- Ekstra özellikler ---- */}
        <div className="chip-row">
          <button type="button" className={'chip' + (targeted ? ' active' : '')} onClick={() => (setTargeted(!targeted), !f.target && set({ target: 3 }))}>
            🎯 {t('te_target')}
          </button>
          <button type="button" className={'chip' + (repeatOn ? ' active' : '')} onClick={() => setRepeatOn(!repeatOn)}>
            🔁 {t('te_repeat')}
          </button>
          <button type="button" className={'chip' + (listOn ? ' active' : '')} onClick={() => (setListOn(!listOn), !list.length && set({ checklist: [{ id: uid(), text: '', done: false }] }))}>
            ☑ {t('te_checklist')}
          </button>
        </div>

        {targeted && (
          <div className="sub-box">
            <div className="row" style={{ alignItems: 'center' }}>
              <span>{t('te_targetCount')}</span>
              <input className="input" type="number" min={2} max={999} style={{ width: 90 }} value={f.target ?? 3} onChange={(e) => set({ target: Number(e.target.value) })} />
              <span className="small muted">{t('te_targetHint')}</span>
            </div>
            <Field label={t('te_gap')}>
              <Seg<GapMode>
                value={gapMode}
                options={[
                  { v: 'free', l: t('te_gapFree') },
                  { v: 'day', l: t('te_gapDay') },
                  { v: 'hours', l: t('te_gapHours') },
                ]}
                onChange={(v) => setRule({ perDay: v === 'day' || undefined, gapHours: v === 'hours' ? rule.gapHours || 6 : undefined })}
              />
            </Field>
            {gapMode === 'hours' && (
              <div className="row" style={{ alignItems: 'center', marginTop: -4, marginBottom: 10 }}>
                <input className="input" type="range" min={1} max={24} value={rule.gapHours ?? 6} onChange={(e) => setRule({ gapHours: Number(e.target.value) })} style={{ flex: 1 }} />
                <b style={{ width: 70 }}>
                  {rule.gapHours ?? 6} {t('hours')}
                </b>
              </div>
            )}
            {gapMode !== 'free' && <p className="small muted" style={{ marginTop: -6 }}>{gapMode === 'day' ? t('te_gapDayHint') : t('te_gapHoursHint')}</p>}
            <div className="set-row" style={{ padding: '4px 0' }}>
              <div>
                🍅 {t('te_needFocus')}
                <div className="small muted">{t('te_needFocusHint')}</div>
              </div>
              <Switch on={!!rule.focusMin} onChange={(v) => setRule({ focusMin: v ? 25 : undefined })} />
            </div>
            {!!rule.focusMin && (
              <div className="row" style={{ alignItems: 'center' }}>
                <span className="small">{t('te_focusAtLeast')}</span>
                <input className="input" type="number" min={5} max={480} step={5} style={{ width: 90 }} value={rule.focusMin} onChange={(e) => setRule({ focusMin: Number(e.target.value) })} />
                <span className="small">{t('minutes')}</span>
              </div>
            )}
            {cur && p && (
              <div style={{ marginTop: 10 }}>
                <div className="progress-row">
                  <span className="small">
                    {p.count}/{p.target}
                  </span>
                  <Bar value={p.pct} />
                  <span className="small">%{Math.round(p.pct * 100)}</span>
                </div>
                {mine.length > 0 && (
                  <div className="log-list" style={{ maxHeight: 160, overflow: 'auto' }}>
                    {[...mine].reverse().map((c) => (
                      <div key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="small">
                          ✓ {fmtDate(c.date, t)} · {timeOfTs(c.at)} {c.focusId ? '🍅' : ''}
                        </span>
                        <button type="button" className="icon-btn" aria-label={t('delete')} onClick={() => void uncheckTask(c.id)}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {repeatOn && (
          <div className="sub-box">
            <div className="row" style={{ alignItems: 'center' }}>
              <span>{t('te_every')}</span>
              <input className="input" type="number" min={1} max={99} style={{ width: 70 }} value={repeat.every} onChange={(e) => set({ repeat: { ...repeat, every: Number(e.target.value) } })} />
              <Seg<TaskRepeat['unit']> value={repeat.unit} options={[{ v: 'day', l: t('day_unit') }, { v: 'week', l: t('week_unit') }, { v: 'month', l: t('month_unit') }]} onChange={(unit) => set({ repeat: { ...repeat, unit } })} />
            </div>
            <p className="small muted">{f.dueDate ? t('te_repeatHint') : t('te_repeatNeedsDate')}</p>
          </div>
        )}

        {listOn && (
          <div className="sub-box">
            {list.map((c, i) => (
              <div key={c.id} className="row" style={{ marginBottom: 6, flexWrap: 'nowrap', alignItems: 'center' }}>
                <input type="checkbox" checked={c.done} onChange={() => set({ checklist: list.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
                <input
                  className="input"
                  value={c.text}
                  placeholder={t('te_step')}
                  onChange={(e) => set({ checklist: list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      set({ checklist: [...list.slice(0, i + 1), { id: uid(), text: '', done: false }, ...list.slice(i + 1)] });
                    }
                  }}
                />
                <button type="button" className="icon-btn" aria-label={t('delete')} onClick={() => set({ checklist: list.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn sm" onClick={() => set({ checklist: [...list, { id: uid(), text: '', done: false }] })}>
              ＋ {t('te_addStep')}
            </button>
          </div>
        )}

        {!targeted && (
          <Field label={t('status')}>
            <select className="input" value={f.status} onChange={(e) => set({ status: e.target.value as Task['status'], doneAt: e.target.value === 'done' ? Date.now() : undefined })}>
              <option value="todo">{t('not_started')}</option>
              <option value="doing">{t('in_progress')}</option>
              <option value="done">{t('done')}</option>
            </select>
          </Field>
        )}
        <Field label={t('reminder')}>
          <input className="input" type="datetime-local" value={f.reminderAt ?? ''} onChange={(e) => set({ reminderAt: e.target.value })} />
        </Field>
        <Field label={t('notes')}>
          <textarea className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <div className="actions">
          {cur && (
            <button type="button" className="btn danger left" onClick={async () => confirm(t('confirm_delete')) && (await deleteTask(cur.id), onClose())}>
              {t('delete')}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn primary">{t('save')}</button>
        </div>
      </form>
    </Modal>
  );
}
