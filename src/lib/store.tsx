import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultPrefs, normalizeWidgets } from './actions';
import { db } from './db';
import { setDayStartHour, todayKey } from './dates';
import { makeT, type T } from './i18n';
import { buildHabitIndex, computeStreak, levelInfo, totalXp, xpByDay, type HabitIndex, type StreakResult } from './logic';
import type { FocusSession, Habit, HabitLog, Prefs, Project, Task, TaskCheck } from './types';

export interface AppData {
  ready: boolean;
  today: string;
  prefs: Prefs;
  t: T;
  habits: Habit[]; // aktif + arşiv (silinenler hariç), sıralı
  logs: HabitLog[];
  tasks: Task[];
  projects: Project[];
  focus: FocusSession[];
  checks: TaskCheck[];
  checksOf: (taskId: string) => TaskCheck[]; // sıralı
  xpDay: Map<string, number>;
  xp: number;
  level: ReturnType<typeof levelInfo>;
  streak: StreakResult;
  habitIdx: Map<string, HabitIndex>; // alışkanlık → gün özeti
  idxOf: (habitId: string) => HabitIndex;
}

const Ctx = createContext<AppData | null>(null);

const alive = <X extends { deleted: 0 | 1 }>(rows: X[] | undefined) => (rows ?? []).filter((r) => !r.deleted);

export function DataProvider({ children }: { children: ReactNode }) {
  const habits = useLiveQuery(() => db.habits.orderBy('order').toArray());
  const logs = useLiveQuery(() => db.habitLogs.toArray());
  const tasks = useLiveQuery(() => db.tasks.toArray());
  const projects = useLiveQuery(() => db.projects.toArray());
  const focus = useLiveQuery(() => db.focus.toArray());
  const checks = useLiveQuery(() => db.taskChecks.toArray());
  const prefsRow = useLiveQuery(() => db.prefs.get('prefs'), [], null);

  // Gün değişimini yakala (uygulama gece açık kalırsa)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const prefs = useMemo<Prefs>(() => {
    const p = { ...defaultPrefs(), updatedAt: 0, dirty: 0, deleted: 0, ...(prefsRow ?? {}) } as Prefs;
    p.widgets = normalizeWidgets(p.widgets);
    return p;
  }, [prefsRow]);

  setDayStartHour(prefs.dayStartHour);
  const today = useMemo(() => todayKey(), [tick, prefs.dayStartHour]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<AppData>(() => {
    const L = alive(logs);
    const Tk = alive(tasks);
    const F = alive(focus);
    const C = alive(checks).sort((a, b) => a.at - b.at);
    const byTask = new Map<string, TaskCheck[]>();
    for (const c of C) byTask.set(c.taskId, [...(byTask.get(c.taskId) ?? []), c]);
    const none: TaskCheck[] = [];
    const xpDay = xpByDay({ habitLogs: L, tasks: Tk, focus: F, checks: C });
    const xp = totalXp(xpDay);
    const H = alive(habits);
    const habitIdx = new Map(H.map((h) => [h.id, buildHabitIndex(h, L)]));
    const empty: HabitIndex = new Map();
    return {
      habitIdx,
      idxOf: (id: string) => habitIdx.get(id) ?? empty,
      ready: habits !== undefined && prefsRow !== null,
      today,
      prefs,
      t: makeT(prefs.lang),
      habits: H,
      logs: L,
      tasks: Tk,
      projects: alive(projects),
      focus: F,
      checks: C,
      checksOf: (id: string) => byTask.get(id) ?? none,
      xpDay,
      xp,
      level: levelInfo(xp),
      streak: computeStreak(xpDay, Math.max(1, prefs.dailyGoalXp), today),
    };
  }, [habits, logs, tasks, projects, focus, checks, prefs, prefsRow, today]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('DataProvider eksik');
  return v;
}
