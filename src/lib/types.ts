/** Core data types for the BFM roster validator. */

/** A non-working day marker. Anything in this list contributes zero work time. */
export const DAY_CODES = ['RDO', 'AL', 'PH', 'SICK', 'LSL', 'TRN'] as const;
export type DayCode = (typeof DAY_CODES)[number];

/**
 * One rostered day for one driver.
 *
 * The planner only ever types a start and a finish (or a code such as RDO).
 * `start` / `finish` are wall-clock 'HH:mm' on `date`. If `finish` is at or before
 * `start` the shift is treated as running past midnight into the next day.
 */
export interface RosterDay {
  /** 'YYYY-MM-DD' */
  date: string;
  start: string | null;
  finish: string | null;
  code: DayCode | null;
}

export interface Driver {
  id: string;
  name: string;
  /** Keyed by 'YYYY-MM-DD'. Only days the planner has touched are stored. */
  days: Record<string, RosterDay>;
}

/** A resolved shift on the absolute timeline, in epoch milliseconds. */
export interface WorkSegment {
  /** The roster date this segment came from ('YYYY-MM-DD'). */
  date: string;
  /** Shift span — clock on to clock off. */
  startMs: number;
  endMs: number;
  /** Minimum in-shift rest this span requires under rules 1-3, in minutes. */
  restMins: number;
  /** Fraction of the span that counts as work time: 1 - restMins/spanMins. */
  workFactor: number;
}

export type Severity = 'violation' | 'warning' | 'info';

export type RuleId =
  | 'R4_24H_WORK'
  | 'R4_24H_REST'
  | 'R5_7DAY_NIGHT'
  | 'R6_14DAY_WORK'
  | 'R6_84H_RESET'
  | 'R6_NIGHT_RESTS'
  | 'DATA_SHORT_HISTORY';

export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  /** Roster dates this finding should light up in the grid. */
  dates: string[];
  /** Short label, e.g. "24-hour rule — maximum work time". */
  title: string;
  /** One-line plain-language explanation, already formatted with the numbers. */
  detail: string;
  /** The window the breach was measured over, for display. */
  windowStartMs?: number;
  windowEndMs?: number;
  /** Measured value and the legal limit, both in minutes, where applicable. */
  actualMins?: number;
  limitMins?: number;
}

/** Per-day derived numbers shown in the grid. */
export interface DayStat {
  date: string;
  /** Clock on to clock off, in minutes. 0 for RDO / empty days. */
  spanMins: number;
  /** span - required in-shift rest. */
  workMins: number;
  /** Minimum in-shift rest this shift length requires under rules 1-3. */
  restMins: number;
  /** Work time falling between midnight and 06:00, in minutes. */
  nightWorkMins: number;
  /** Long/night work time attributed to this day, in minutes. */
  longNightMins: number;
  /** A night rest break (7 continuous hours between 22:00 and 08:00) starts on this night. */
  nightRestBreak: boolean;
  /** A 24-hour continuous rest period covers part of this day. */
  rest24: boolean;
  /** Rolling 7-day long/night work total for the 7 days ending on this day. */
  rolling7NightMins: number;
  /** Rolling 14-day work total for the 14 days ending on this day. */
  rolling14WorkMins: number;
  /** Work since the end of the last 24-hour rest, at the end of this day (the 84-hour counter). */
  since24RestMins: number;
}

export interface ValidationResult {
  findings: Finding[];
  stats: Record<string, DayStat>;
  /** Dates with at least one 'violation'. */
  violationDates: Set<string>;
  /** Dates with at least one 'warning' but no violation. */
  warningDates: Set<string>;
}
