/**
 * Turning "you have broken a rule" into "here is what you can actually roster".
 *
 * Both helpers work by asking the validator itself, so they can never drift
 * away from the rules the grid enforces.
 */

import { validate } from './engine';
import { buildSegments } from './engine';
import { HOUR, MIN, addDays, fmtHHMM, parseHHMM } from './time';
import { setDay } from './storage';
import type { Driver } from './types';

const STEP = 5; // minutes

export interface Window {
  from: string;
  to: string;
}

/**
 * True when `candidate` introduces no violation beyond whatever the roster
 * already had without `date` filled in. This is what makes the suggestion
 * about *this* shift, rather than being silenced by an unrelated breach the
 * planner hasn't got round to fixing yet elsewhere in the window.
 */
function isCleanForDate(driver: Driver, date: string, win: Window): boolean {
  const baseline = validate(setDay(driver, date, { start: null, finish: null, code: null }), win)
    .violationDates;
  const candidate = validate(driver, win).violationDates;
  for (const d of candidate) if (!baseline.has(d)) return false;
  return true;
}

/**
 * The latest finish time that keeps the roster legal, for a given start.
 * Returns null when even the shortest sensible shift breaches something —
 * i.e. the problem is elsewhere, not with this shift's length.
 */
export function latestFinish(
  driver: Driver,
  date: string,
  start: string,
  win: Window,
): { finish: string; spanMins: number } | null {
  const s = parseHHMM(start);
  if (s == null) return null;
  const base = setDay(driver, date, { start, finish: null, code: null });

  let best: number | null = null;
  // 17 hours is the longest a working day can run and still leave 7 continuous
  // hours of rest inside the 24-hour period, so there is no point looking past it.
  for (let span = 60; span <= 17 * 60; span += STEP) {
    const candidate = setDay(base, date, { finish: fmtHHMM(s + span), start, code: null });
    if (isCleanForDate(candidate, date, win)) best = span;
    else if (best != null) break; // once it starts failing it stays failing
  }
  if (best == null) return null;
  return { finish: fmtHHMM(s + best), spanMins: best };
}

/**
 * The earliest a driver can clock on for `date`: seven continuous hours after
 * the end of the previous working day.
 */
export function earliestStart(driver: Driver, date: string, win: Window): string | null {
  const dates: string[] = [];
  for (let d = win.from; d <= win.to; d = addDays(d, 1)) dates.push(d);
  const segs = buildSegments(
    dates.filter((d) => d < date).map((d) => driver.days[d] ?? { date: d, start: null, finish: null, code: null }),
  );
  const prev = segs[segs.length - 1];
  if (!prev) return null;
  const earliest = prev.endMs + 7 * HOUR;
  const dayStart = new Date(date + 'T00:00:00').getTime();
  if (earliest <= dayStart) return null; // no constraint left by the time this day starts
  return fmtHHMM(Math.round((earliest - dayStart) / MIN));
}
