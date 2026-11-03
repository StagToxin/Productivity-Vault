import { useState, useSyncExternalStore } from 'react';
import { deleteHabit, deleteProject, HABIT_COLORS, saveHabit, saveProject, SLOT_PRESETS } from '../lib/actions';
import { uid } from '../lib/db';
import { HabitDayEditor, HabitDetail } from './HabitViews';
import { useData } from '../lib/store';
import type { Habit, HabitSlot, Project, Task } from '../lib/types';
import { TaskEditor } from './TaskEditor';
import { ProjectDetail } from './ProjectDetail';
import { EmojiPicker, Field, Modal, Seg, Swatches } from './ui';

type EditorState =
  | { kind: 'habit'; id?: string; defaults?: Partial<Habit> }
  | { kind: 'task'; id?: string; defaults?: Partial<Task> }
  | { kind: 'project'; id?: string }
  | { kind: 'habitDetail'; id: string }
  | { kind: 'habitDay'; id: string; date: string }
  | { kind: 'projectDetail'; id: string; tab?: 'tasks' | 'calendar' | 'plan' }
  | null;

// Editörler üst üste açılabilir (ör. proje detayından görev düzenleme): kapanınca bir öncekine dönülür.
let stack: NonNullable<EditorState>[] = [];
let state: EditorState = null;
const subs = new Set<() => void>();
const emit = () => {
  state = stack[stack.length - 1] ?? null;
  subs.forEach((f) => f());
};
export function openEditor(s: EditorState) {
  if (!s) stack = [];
  else if (s.kind === 'projectDetail' || s.kind === 'habitDetail' || !stack.length) stack = [s];
  else if (stack[stack.length - 1].kind === 'projectDetail' || stack[stack.length - 1].kind === 'habitDetail') stack = [...stack, s];
  else stack = [...stack.slice(0, -1), s];
  emit();
}
/** Üstteki editörü kapat (altta proje/alışkanlık detayı varsa ona dön). */
export function closeEditor() {
  stack = stack.slice(0, -1);
  emit();
}
const close = closeEditor;
/** Takvim seçimi gibi yerler için: editör kapandığında haber al. */
export function onEditorChange(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}
export const editorOpen = () => state !== null;

export function EditorHost() {
  const s = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state);
  if (!s) return null;
  if (s.kind === 'habit') return <HabitEditor key={s.id ?? 'new'} id={s.id} defaults={s.defaults} />;
  if (s.kind === 'task') return <TaskEditor key={s.id ?? 'new'} id={s.id} defaults={s.defaults} onClose={close} />;
  if (s.kind === 'projectDetail') return <ProjectDetail key={s.id} id={s.id} tab={s.tab} onClose={close} />;
  if (s.kind === 'habitDetail') return <HabitDetail key={s.id} id={s.id} />;
  if (s.kind === 'habitDay') return <HabitDayEditor key={s.id + s.date} id={s.id} date={s.date} />;
  return <ProjectEditor key={s.id ?? 'new'} id={s.id} />;
}

function HabitEditor({ id, defaults }: { id?: string; defaults?: Partial<Habit> }) {
  const { habits, t, prefs } = useData();
  const cur = habits.find((h) => h.id === id);
  const [f, setF] = useState<Partial<Habit>>(cur ?? { name: '', icon: '🎯', color: HABIT_COLORS[habits.length % HABIT_COLORS.length], weeklyTarget: 7, ...defaults });
  const [multi, setMulti] = useState((cur?.slots?.length ?? 0) > 0);
  const [specific, setSpecific] = useState(((cur ?? defaults)?.days?.length ?? 0) > 0);
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
              <button
                type="button"
                className="btn danger left"
                onClick={async () => {
                  if (!confirm(t('confirm_delete'))) return;
                  // ortak alışkanlıksa önce gruptan ayrıl (paylaşılmış günler silinsin)
                  if (cur.share) await import('../lib/social').then((m) => m.leaveGroup(cur.share!.groupId)).catch(() => {});
                  await deleteHabit(cur.id);
                  close();
                }}
              >
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

function ProjectEditor({ id }: { id?: string }) {
  const { projects, t } = useData();
  const cur = projects.find((p) => p.id === id);
  const [f, setF] = useState<Partial<Project>>(cur ?? { name: '', icon: '📌', color: HABIT_COLORS[1] });
  const set = (p: Partial<Project>) => setF((x) => ({ ...x, ...p }));
  const submit = async () => {
    if (!f.name?.trim()) return;
    await saveProject({ ...f, name: f.name.trim(), start: f.start || undefined, deadline: f.deadline || undefined });
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
        <div className="row">
          <Field label={t('start_date')}>
            <input className="input" type="date" value={f.start ?? ''} max={f.deadline} onChange={(e) => set({ start: e.target.value })} />
          </Field>
          <Field label={t('deadline')}>
            <input className="input" type="date" value={f.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value })} />
          </Field>
        </div>
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
