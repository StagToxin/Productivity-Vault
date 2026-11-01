import { useState, useSyncExternalStore } from 'react';
import { deleteHabit, deleteProject, deleteTask, HABIT_COLORS, saveHabit, saveProject, saveTask, SLOT_PRESETS } from '../lib/actions';
import { uid } from '../lib/db';
import { HabitDayEditor, HabitDetail } from './HabitViews';
import { useData } from '../lib/store';
import type { Habit, HabitSlot, Priority, Project, Task } from '../lib/types';
import { EmojiPicker, Field, Modal, Seg, Swatches } from './ui';

type EditorState =
  | { kind: 'habit'; id?: string }
  | { kind: 'task'; id?: string; defaults?: Partial<Task> }
  | { kind: 'project'; id?: string }
  | { kind: 'habitDetail'; id: string }
  | { kind: 'habitDay'; id: string; date: string }
  | null;

let state: EditorState = null;
const subs = new Set<() => void>();
export function openEditor(s: EditorState) {
  state = s;
  subs.forEach((f) => f());
}
const close = () => openEditor(null);

export function EditorHost() {
  const s = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state);
  if (!s) return null;
  if (s.kind === 'habit') return <HabitEditor key={s.id ?? 'new'} id={s.id} />;
  if (s.kind === 'task') return <TaskEditor key={s.id ?? 'new'} id={s.id} defaults={s.defaults} />;
  if (s.kind === 'habitDetail') return <HabitDetail key={s.id} id={s.id} />;
  if (s.kind === 'habitDay') return <HabitDayEditor key={s.id + s.date} id={s.id} date={s.date} />;
  return <ProjectEditor key={s.id ?? 'new'} id={s.id} />;
}

function HabitEditor({ id }: { id?: string }) {
  const { habits, t, prefs } = useData();
  const cur = habits.find((h) => h.id === id);
  const [f, setF] = useState<Partial<Habit>>(cur ?? { name: '', icon: '🎯', color: HABIT_COLORS[habits.length % HABIT_COLORS.length], weeklyTarget: 7 });
  const [multi, setMulti] = useState((cur?.slots?.length ?? 0) > 0);
  const [specific, setSpecific] = useState((cur?.days?.length ?? 0) > 0);
  const set = (p: Partial<Habit>) => setF((x) => ({ ...x, ...p }));
  const slots = f.slots ?? [];
  const setSlot = (i: number, p: Partial<HabitSlot>) => set({ slots: slots.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const dow = prefs.weekStartsMonday ? t.dow : [t.dow[6], ...t.dow.slice(0, 6)];
  const dayIdx = (col: number) => (prefs.weekStartsMonday ? col : (col + 6) % 7); // sütun → 0=Pzt indeksi
  const days = f.days ?? [];

  const submit = async () => {
    if (!f.name?.trim()) return;
    const cleanSlots = multi ? slots.filter((s) => s.name.trim()).map((s) => ({ ...s, name: s.name.trim(), time: s.time || undefined })) : undefined;
    const cleanDays = specific && days.length ? [...days].sort() : undefined;
    await saveHabit({
      ...f,
      name: f.name.trim(),
      reminderTime: f.reminderTime || undefined,
      slots: cleanSlots?.length ? cleanSlots : undefined,
      days: cleanDays,
      weeklyTarget: cleanDays ? cleanDays.length : f.weeklyTarget ?? 7,
    });
    close();
  };

  const applyPreset = (key: string) => {
    const p = SLOT_PRESETS.find((x) => x.key === key)!;
    set({
      slots: p.slots.map((s) => ({ ...s, id: uid() })),
      icon: f.icon === '🎯' || !f.icon ? p.icon : f.icon,
      name: f.name || t(`preset_${key}` as 'preset_prayer'),
    });
  };

  return (
    <Modal title={cur ? t('edit') : t('add_habit')} onClose={close}>
      <form onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label={t('name')}>
          <input className="input" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>

        <Field label={t('h_frequency')}>
          <Seg value={multi ? 'multi' : 'once'} options={[{ v: 'once', l: t('h_mode_once') }, { v: 'multi', l: t('h_mode_multi') }]} onChange={(v) => {
            setMulti(v === 'multi');
            if (v === 'multi' && !slots.length) set({ slots: [{ id: uid(), name: '1', time: '' }, { id: uid(), name: '2', time: '' }] });
          }} />
        </Field>

        {multi && (
          <div className="slot-editor">
            <div className="chip-row" style={{ marginBottom: 8 }}>
              <span className="small muted">{t('h_presets')}:</span>
              {SLOT_PRESETS.map((p) => (
                <button type="button" key={p.key} className="chip" onClick={() => applyPreset(p.key)}>
                  {p.icon} {t(`preset_${p.key}` as 'preset_prayer')}
                </button>
              ))}
            </div>
            {slots.map((s, i) => (
              <div key={s.id} className="row" style={{ marginBottom: 6, flexWrap: 'nowrap' }}>
                <span className="small muted" style={{ width: 18 }}>{i + 1}</span>
                <input className="input" placeholder={t('h_slotName')} value={s.name} onChange={(e) => setSlot(i, { name: e.target.value })} />
                <input className="input" type="time" style={{ width: 120, flexShrink: 0 }} value={s.time ?? ''} onChange={(e) => setSlot(i, { time: e.target.value })} />
                <button type="button" className="icon-btn" aria-label={t('delete')} onClick={() => set({ slots: slots.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn sm" onClick={() => set({ slots: [...slots, { id: uid(), name: String(slots.length + 1), time: '' }] })}>
              ＋ {t('h_addSlot')}
            </button>
            <p className="small muted">{t('h_slotHint')}</p>
          </div>
        )}

        <Field label={t('h_schedule')}>
          <Seg value={specific ? 'days' : 'target'} options={[{ v: 'target', l: t('h_weeklyTarget') }, { v: 'days', l: t('h_specificDays') }]} onChange={(v) => setSpecific(v === 'days')} />
        </Field>
        {specific ? (
          <div className="seg" style={{ marginBottom: 12 }}>
            {dow.map((d, col) => {
              const di = dayIdx(col);
              const on = days.includes(di);
              return (
                <button type="button" key={d} className={on ? 'on' : ''} onClick={() => set({ days: on ? days.filter((x) => x !== di) : [...days, di] })}>
                  {d}
                </button>
              );
            })}
          </div>
        ) : (
          <Field label={t('weekly_target')}>
            <Seg value={f.weeklyTarget ?? 7} options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ v: n, l: String(n) }))} onChange={(weeklyTarget) => set({ weeklyTarget })} />
          </Field>
        )}

        <Field label={t('icon')}>
          <EmojiPicker value={f.icon ?? ''} onChange={(icon) => set({ icon })} />
        </Field>
        <Field label={t('color')}>
          <Swatches value={f.color ?? HABIT_COLORS[0]} colors={HABIT_COLORS} onChange={(color) => set({ color })} />
        </Field>
        {!multi && (
          <Field label={t('reminder')}>
            <input className="input" type="time" value={f.reminderTime ?? ''} onChange={(e) => set({ reminderTime: e.target.value })} />
          </Field>
        )}
        <div className="actions">
          {cur && (
            <>
              <button type="button" className="btn danger left" onClick={async () => confirm(t('confirm_delete')) && (await deleteHabit(cur.id), close())}>
                {t('delete')}
              </button>
              <button type="button" className="btn" onClick={async () => (await saveHabit({ ...cur, archived: cur.archived ? 0 : 1 }), close())}>
                {cur.archived ? t('unarchive') : t('archive')}
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={close}>
            {t('cancel')}
          </button>
          <button className="btn primary">{t('save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function TaskEditor({ id, defaults }: { id?: string; defaults?: Partial<Task> }) {
  const { tasks, projects, t, today } = useData();
  const cur = tasks.find((x) => x.id === id);
  const [f, setF] = useState<Partial<Task>>(cur ?? { title: '', notes: '', priority: 1, status: 'todo', dueDate: today, ...defaults });
  const set = (p: Partial<Task>) => setF((x) => ({ ...x, ...p }));
  const submit = async () => {
    if (!f.title?.trim()) return;
    await saveTask({ ...f, title: f.title.trim(), dueDate: f.dueDate || undefined, dueTime: f.dueTime || undefined, reminderAt: f.reminderAt || undefined, projectId: f.projectId || undefined });
    close();
  };
  return (
    <Modal title={cur ? t('edit') : t('add_task')} onClose={close}>
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
          <Field label={t('due_date')}>
            <input className="input" type="date" value={f.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value })} />
          </Field>
        </div>
        <div className="row">
          <Field label={t('due_time')}>
            <input className="input" type="time" value={f.dueTime ?? ''} onChange={(e) => set({ dueTime: e.target.value })} />
          </Field>
          <Field label={t('duration')}>
            <select className="input" value={f.duration ?? 30} onChange={(e) => set({ duration: Number(e.target.value) })}>
              {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {m >= 60 ? `${m / 60} ${t('hours')}` : `${m} ${t('minutes')}`}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row">
          <Field label={t('priority')}>
            <Seg<Priority> value={f.priority ?? 1} options={[0, 1, 2].map((n) => ({ v: n as Priority, l: t(`prio_${n}` as 'prio_0') }))} onChange={(priority) => set({ priority })} />
          </Field>
          <Field label={t('status')}>
            <select className="input" value={f.status} onChange={(e) => set({ status: e.target.value as Task['status'], doneAt: e.target.value === 'done' ? Date.now() : undefined })}>
              <option value="todo">{t('not_started')}</option>
              <option value="doing">{t('in_progress')}</option>
              <option value="done">{t('done')}</option>
            </select>
          </Field>
        </div>
        <Field label={t('reminder')}>
          <input className="input" type="datetime-local" value={f.reminderAt ?? ''} onChange={(e) => set({ reminderAt: e.target.value })} />
        </Field>
        <Field label={t('notes')}>
          <textarea className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <div className="actions">
          {cur && (
            <button type="button" className="btn danger left" onClick={async () => confirm(t('confirm_delete')) && (await deleteTask(cur.id), close())}>
              {t('delete')}
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            {t('cancel')}
          </button>
          <button className="btn primary">{t('save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectEditor({ id }: { id?: string }) {
  const { projects, t } = useData();
  const cur = projects.find((p) => p.id === id);
  const [f, setF] = useState<Partial<Project>>(cur ?? { name: '', icon: '📌', color: HABIT_COLORS[1] });
  const set = (p: Partial<Project>) => setF((x) => ({ ...x, ...p }));
  const submit = async () => {
    if (!f.name?.trim()) return;
    await saveProject({ ...f, name: f.name.trim(), deadline: f.deadline || undefined });
    close();
  };
  return (
    <Modal title={cur ? t('edit') : t('add_project')} onClose={close}>
      <form onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label={t('name')}>
          <input className="input" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={t('icon')}>
          <EmojiPicker value={f.icon ?? ''} onChange={(icon) => set({ icon })} />
        </Field>
        <Field label={t('color')}>
          <Swatches value={f.color ?? HABIT_COLORS[1]} colors={HABIT_COLORS} onChange={(color) => set({ color })} />
        </Field>
        <Field label={t('deadline')}>
          <input className="input" type="date" value={f.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value })} />
        </Field>
        <div className="actions">
          {cur && (
            <button type="button" className="btn danger left" onClick={async () => confirm(t('confirm_delete')) && (await deleteProject(cur.id), close())}>
              {t('delete')}
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            {t('cancel')}
          </button>
          <button className="btn primary">{t('save')}</button>
        </div>
      </form>
    </Modal>
  );
}
