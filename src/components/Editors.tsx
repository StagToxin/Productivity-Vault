import { useState, useSyncExternalStore } from 'react';
import { deleteHabit, deleteProject, deleteTask, HABIT_COLORS, saveHabit, saveProject, saveTask } from '../lib/actions';
import { useData } from '../lib/store';
import type { Habit, Priority, Project, Task } from '../lib/types';
import { EmojiPicker, Field, Modal, Seg, Swatches } from './ui';

type EditorState =
  | { kind: 'habit'; id?: string }
  | { kind: 'task'; id?: string; defaults?: Partial<Task> }
  | { kind: 'project'; id?: string }
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
  return <ProjectEditor key={s.id ?? 'new'} id={s.id} />;
}

function HabitEditor({ id }: { id?: string }) {
  const { habits, t } = useData();
  const cur = habits.find((h) => h.id === id);
  const [f, setF] = useState<Partial<Habit>>(cur ?? { name: '', icon: '🎯', color: HABIT_COLORS[habits.length % HABIT_COLORS.length], weeklyTarget: 7 });
  const set = (p: Partial<Habit>) => setF((x) => ({ ...x, ...p }));
  const submit = async () => {
    if (!f.name?.trim()) return;
    await saveHabit({ ...f, name: f.name.trim(), reminderTime: f.reminderTime || undefined });
    close();
  };
  return (
    <Modal title={cur ? t('edit') : t('add_habit')} onClose={close}>
      <form onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label={t('name')}>
          <input className="input" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={t('icon')}>
          <EmojiPicker value={f.icon ?? ''} onChange={(icon) => set({ icon })} />
        </Field>
        <Field label={t('color')}>
          <Swatches value={f.color ?? HABIT_COLORS[0]} colors={HABIT_COLORS} onChange={(color) => set({ color })} />
        </Field>
        <Field label={t('weekly_target')}>
          <Seg value={f.weeklyTarget ?? 7} options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ v: n, l: String(n) }))} onChange={(weeklyTarget) => set({ weeklyTarget })} />
        </Field>
        <Field label={t('reminder')}>
          <input className="input" type="time" value={f.reminderTime ?? ''} onChange={(e) => set({ reminderTime: e.target.value })} />
        </Field>
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
    await saveTask({ ...f, title: f.title.trim(), dueDate: f.dueDate || undefined, reminderAt: f.reminderAt || undefined, projectId: f.projectId || undefined });
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
