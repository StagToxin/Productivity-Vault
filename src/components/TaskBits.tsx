// Görev kartlarında ortak parçalar: hedefli görev tik butonu, ilerleme, tempo rozeti.
import { checkTask, setTaskStatus, toggleChecklistItem, uncheckTask } from '../lib/actions';
import { dayKeyOfTs, diffDays, fromKey, timeOfTs } from '../lib/dates';
import { XP } from '../lib/logic';
import { useData } from '../lib/store';
import { canCheck, isMultiDay, isTargeted, taskPace, taskProgress, type CheckBlock } from '../lib/tasks';
import { timer } from '../lib/timer';
import type { Task } from '../lib/types';
import { toast } from './ui';
import { Bar } from './ui';

type T = ReturnType<typeof useData>['t'];

export function whenText(ts: number, today: string, t: T): string {
  const k = dayKeyOfTs(ts);
  const d = diffDays(k, today);
  const hm = timeOfTs(ts);
  if (d === 0) return hm;
  if (d === 1) return `${t('tomorrow')} ${hm}`;
  const dt = fromKey(k);
  return `${dt.getDate()} ${t.months[dt.getMonth()].slice(0, 3)} ${hm}`;
}

export function blockText(b: Exclude<CheckBlock, { ok: true }>, today: string, t: T): string {
  switch (b.reason) {
    case 'complete':
      return t('tk_complete');
    case 'notStarted':
      return t('tk_notStarted', { d: `${fromKey(b.date).getDate()} ${t.months[fromKey(b.date).getMonth()].slice(0, 3)}` });
    case 'gap':
    case 'perDay':
      return t('tk_nextAt', { w: whenText(b.nextAt, today, t) });
    case 'focus':
      return t('tk_needFocus', { have: b.have, need: b.need });
  }
}

export function startFocusFor(taskId: string) {
  timer.link({ taskId, habitId: undefined });
  location.hash = 'focus';
}

/** Hedefli görev: "Tik at 2/3" düğmesi (şart sağlanmıyorsa kilitli ve nedeni yazılı). */
export function TaskCheckButton({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { t, checksOf, focus, today } = useData();
  const mine = checksOf(task.id);
  const p = taskProgress(task, mine);
  const b = canCheck(task, mine, focus, Date.now());
  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!b.ok) {
      if (b.reason === 'focus') startFocusFor(task.id);
      return;
    }
    const r = await checkTask(task.id);
    if (r.ok) {
      const label = r.completed ? `🎉 ${task.title} ${t('done')}!` : `✓ ${task.title} ${r.count}/${r.target} (%${Math.round((r.count / r.target) * 100)})`;
      toast(`${label} +${XP.taskCheck} XP`, { label: t('undo'), run: () => void uncheckTask(r.check.id) });
    }
  };
  if (p.complete)
    return (
      <button className={'mark-btn on' + (compact ? ' sm' : '')} onClick={(e) => (e.stopPropagation(), void setTaskStatus(task.id, 'todo'))} title={t('tk_reopen')}>
        ✓ {t('done')} {p.count}/{p.target}
      </button>
    );
  return (
    <button className={'mark-btn' + (b.ok ? '' : ' locked') + (compact ? ' sm' : '')} onClick={run} title={b.ok ? t('tk_check') : blockText(b, today, t)}>
      {b.ok ? `✓ ${t('tk_check')} ${p.count}/${p.target}` : b.reason === 'focus' ? `▶ ${blockText(b, today, t)}` : `🔒 ${blockText(b, today, t)}`}
    </button>
  );
}

export function PaceBadge({ task }: { task: Task }) {
  const { t, checksOf, today } = useData();
  const pace = taskPace(task, checksOf(task.id), today);
  if (!pace) return null;
  const cls = pace.state === 'behind' ? 'red' : pace.state === 'ahead' ? 'green' : 'blue';
  return (
    <span className={'badge ' + cls} title={t('tk_paceHint', { n: pace.daysLeft })}>
      {t(`pace_${pace.state}` as 'pace_behind')}
    </span>
  );
}

/** Kartta ilerleme satırı: hedefli görevde tik, alt adımlarda adım ilerlemesi. */
export function TaskProgressLine({ task, color }: { task: Task; color?: string }) {
  const { checksOf } = useData();
  const p = taskProgress(task, checksOf(task.id));
  if (!isTargeted(task) && !(task.checklist?.length)) return null;
  return (
    <div className="progress-row">
      <span className="small">{isTargeted(task) ? '🎯' : '☑'} {p.count}/{p.target}</span>
      <Bar value={p.pct} color={color} />
      <span className="small">%{Math.round(p.pct * 100)}</span>
    </div>
  );
}

export function TaskTags({ task }: { task: Task }) {
  const { t } = useData();
  const bits: string[] = [];
  if (task.repeat) bits.push(`🔁 ${t(`rep_${task.repeat.unit}` as 'rep_day', { n: task.repeat.every })}`);
  if (isMultiDay(task)) bits.push(`↔ ${task.startDate!.slice(5)} → ${task.dueDate!.slice(5)}`);
  if (task.rule?.focusMin) bits.push(`🍅 ${task.rule.focusMin} ${t('minutes')}`);
  if (task.rule?.perDay) bits.push('1/' + t('day_unit'));
  if (task.rule?.gapHours) bits.push(`⏳ ${task.rule.gapHours} ${t('hours')}`);
  if (task.milestone) bits.push('◆ ' + t('milestone'));
  if (!bits.length) return null;
  return <span className="muted">{bits.join(' · ')}</span>;
}

export function Checklist({ task }: { task: Task }) {
  if (!task.checklist?.length) return null;
  return (
    <div className="checklist" onClick={(e) => e.stopPropagation()}>
      {task.checklist.map((c) => (
        <label key={c.id} className={c.done ? 'done' : ''}>
          <input type="checkbox" checked={c.done} onChange={() => void toggleChecklistItem(task.id, c.id)} />
          {c.text}
        </label>
      ))}
    </div>
  );
}
