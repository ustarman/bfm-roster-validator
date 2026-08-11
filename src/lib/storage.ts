import type { Driver, RosterDay } from './types';
import { todayISO, weekStart, addDays } from './time';

const KEY = 'bfm-roster-validator.v1';

export interface AppState {
  drivers: Driver[];
  selectedDriverId: string | null;
  /** Sunday of the week being planned. The two weeks before it are the history. */
  planningWeekStart: string;
}

export function newDriver(name: string): Driver {
  return { id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, days: {} };
}

export function defaultState(): AppState {
  const d = newDriver('Driver 1');
  return {
    drivers: [d],
    selectedDriverId: d.id,
    // Default to planning the week after the current one.
    planningWeekStart: addDays(weekStart(todayISO()), 7),
  };
}

export function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.drivers?.length) return defaultState();
    return parsed;
  } catch {
    return defaultState();
  }
}

export function save(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked — the app still works for the current session.
  }
}

export function setDay(driver: Driver, date: string, patch: Partial<RosterDay>): Driver {
  const existing: RosterDay = driver.days[date] ?? { date, start: null, finish: null, code: null };
  const next: RosterDay = { ...existing, ...patch, date };
  const days = { ...driver.days };
  if (!next.start && !next.finish && !next.code) delete days[date];
  else days[date] = next;
  return { ...driver, days };
}
