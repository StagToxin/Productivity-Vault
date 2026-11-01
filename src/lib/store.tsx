import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultPrefs, normalizeWidgets } from './actions';
import { db } from './db';
import { setDayStartHour, todayKey } from './dates';
import { makeT, type T } from './i18n';
import { computeStreak, levelInfo, totalXp, xpByDay, type StreakResult } from './logic';
import type { FocusSession, Habit, HabitLog, Prefs, Project, Task } from './types';

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
  xpDay: Map<string, number>;
  xp: number;
  level: ReturnType<typeof levelInfo>;
  streak: StreakResult;
}

const Ctx = createContext<AppData | null>(null);

const alive = <X extends { deleted: 0 | 1 }>(rows: X[] | undefined) => (rows ?? []).filter((r) => !r.deleted);

export function DataProvider({ children }: { children: ReactNode }) {
  const habits = useLiveQuery(() => db.habits.orderBy('order').toArray());
  const logs = useLiveQuery(() => db.habitLogs.toArray());
  const tasks = useLiveQuery(() => db.tasks.toArray());
  const projects = useLiveQuery(() => db.projects.toArray());
  const focus = useLiveQuery(() => db.focus.toArray());
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
    const xpDay = xpByDay({ habitLogs: L, tasks: Tk, focus: F });
    const xp = totalXp(xpDay);
    return {
      ready: habits !== undefined && prefsRow !== null,
      today,
      prefs,
      t: makeT(prefs.lang),
      habits: alive(habits),
      logs: L,
      tasks: Tk,
      projects: alive(projects),
      focus: F,
      xpDay,
      xp,
      level: levelInfo(xp),
      streak: computeStreak(xpDay, Math.max(1, prefs.dailyGoalXp), today),
    };
  }, [habits, logs, tasks, projects, focus, prefs, prefsRow, today]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('DataProvider eksik');
  return v;
}
