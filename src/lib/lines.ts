/**
 * Duty lines.
 *
 * The linehaul roster is not a list of drivers — it is 36 fixed weekly patterns
 * ("lines"), and a driver holds a line for months at a time. So the question to
 * answer is "is this line legal, week after week?", which is a different
 * question from "is this person legal?".
 *
 * That distinction is the whole reason this module exists. A line repeats, so
 * the breach that matters most is the one that only shows up when Saturday runs
 * into the next Sunday — exactly the seam a one-week spreadsheet cannot see. We
 * find it by laying the same week down three times and handing the result to
 * the ordinary validator, which needs no changes at all: it already reasons
 * about a rolling 21-day window.
 *
 * Three weeks is the smallest number that gives an honest answer. The middle
 * week has a full fortnight of history behind it and a week ahead of it, so its
 * 14-day figures have settled into the steady state a driver actually lives.
 */

import { validate } from './engine';
import { addDays, fmtHHMM, parseHHMM } from './time';
import type { Driver, Finding, RosterDay, ValidationResult } from './types';
import {
  CATALOGUE_DAYLIGHT,
  CATALOGUE_STANDARD,
  LINES_DAYLIGHT,
  LINES_STANDARD,
  type DutyCatalogue,
} from './pays-lines';

export type DaylightMode = 'standard' | 'daylight';

export const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export interface DutyLine {
  id: string;
  number: number;
  /** Seven cells, Sunday first. Empty string means a rostered day off. */
  week: string[];
}

/** What a single cell of the grid resolves to. */
export interface ParsedCell {
  kind: 'off' | 'duty' | 'error';
  /** 'HH:mm' */
  start?: string;
  finish?: string;
  route?: string;
  spanMins?: number;
  /** Why the cell could not be read, for the planner. */
  problem?: string;
}

export function catalogueFor(mode: DaylightMode): DutyCatalogue {
  return mode === 'daylight' ? CATALOGUE_DAYLIGHT : CATALOGUE_STANDARD;
}

export function seedLines(mode: DaylightMode): DutyLine[] {
  const seed = mode === 'daylight' ? LINES_DAYLIGHT : LINES_STANDARD;
  return seed.map((l) => ({
    id: `line-${l.number}`,
    number: l.number,
    week: l.week.map((c) => c ?? ''),
  }));
}

const ROUTE_CLEAN = /\s*-\s*/g;

/** Normalise a typed route so 'bpf - c - bpf' finds 'BPF-C-BPF'. */
export function normaliseRoute(route: string): string {
  return route.trim().toUpperCase().replace(ROUTE_CLEAN, '-').replace(/\s+/g, ' ');
}

/**
 * Read one grid cell.
 *
 * Accepts what the planner already writes on the spreadsheet — a start time and
 * the name of the run — and looks the length up in the catalogue. An explicit
 * pair of times is accepted too, for a one-off that has no catalogue entry.
 *
 *   ''  /  'RDO'            a day off
 *   '02:00 BPF-C-BPF'       start plus a known run
 *   '02:00-13:40'           start and finish spelled out
 */
export function parseCell(text: string, catalogue: DutyCatalogue): ParsedCell {
  const raw = text.trim();
  if (!raw || /^(r\.?d\.?o\.?|off)$/i.test(raw)) return { kind: 'off' };

  const explicit = /^(\d{1,2}[:.]?\d{2})\s*(?:-|to|\s)\s*(\d{1,2}[:.]?\d{2})$/i.exec(raw);
  if (explicit) {
    const s = parseHHMM(explicit[1]);
    const f = parseHHMM(explicit[2]);
    if (s == null || f == null) return { kind: 'error', problem: 'Times not understood.' };
    const spanMins = (f - s + 24 * 60) % (24 * 60) || 24 * 60;
    return { kind: 'duty', start: fmtHHMM(s), finish: fmtHHMM(f), spanMins };
  }

  const withRoute = /^(\d{1,2}[:.]?\d{2})\s+(.+)$/.exec(raw);
  if (!withRoute) {
    const only = parseHHMM(raw);
    if (only != null) return { kind: 'error', problem: 'Needs a run name or a finish time.' };
    return { kind: 'error', problem: 'Start time missing.' };
  }

  const start = parseHHMM(withRoute[1]);
  if (start == null) return { kind: 'error', problem: 'Start time not understood.' };
  const route = normaliseRoute(withRoute[2]);
  const spanMins = catalogue[route];
  if (spanMins == null) {
    return { kind: 'error', route, problem: `${route} is not in the duty list — type a finish time instead.` };
  }
  return { kind: 'duty', start: fmtHHMM(start), finish: fmtHHMM(start + spanMins), route, spanMins };
}

/**
 * A fixed Sunday to lay the pattern on. Duty lines have no real dates — the
 * anchor only has to be a Sunday, and holding it still keeps results stable
 * from one day to the next.
 */
export const LINE_ANCHOR = '2026-06-07';

export const LINE_WEEKS = 3;
/** Index of the first day of the settled middle week. */
export const LINE_STEADY_OFFSET = 7;

/** Lay a line's week down `LINE_WEEKS` times, as a driver the engine can read. */
export function expandLine(line: DutyLine, catalogue: DutyCatalogue): Driver {
  const days: Record<string, RosterDay> = {};
  for (let w = 0; w < LINE_WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(LINE_ANCHOR, w * 7 + d);
      const cell = parseCell(line.week[d] ?? '', catalogue);
      days[date] =
        cell.kind === 'duty'
          ? { date, start: cell.start!, finish: cell.finish!, code: null }
          : { date, start: null, finish: null, code: 'RDO' };
    }
  }
  return { id: line.id, name: `Duty ${line.number}`, days };
}

export interface LineResult {
  line: DutyLine;
  cells: ParsedCell[];
  /** Validation over the whole three-week expansion. */
  result: ValidationResult;
  /** Findings worth showing — one per rule, since every week repeats. */
  findings: Finding[];
  /** Per weekday, taken from the settled middle week. */
  nightRest: boolean[];
  rest24: boolean[];
  workMins: number[];
  /** Days worked in the week. */
  daysOn: number;
  weeklyWorkMins: number;
  /** Cells the planner still needs to fix. */
  errors: number;
  status: 'ok' | 'breach' | 'incomplete';
}

/**
 * Collapse findings to one per rule. Every week is identical, so the same
 * breach surfaces once per repeat and would otherwise be reported three times.
 */
function onePerRule(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    if (f.severity === 'info') continue;
    if (seen.has(f.ruleId)) continue;
    seen.add(f.ruleId);
    out.push(f);
  }
  return out;
}

export function validateLine(line: DutyLine, mode: DaylightMode): LineResult {
  const catalogue = catalogueFor(mode);
  const cells = line.week.map((c) => parseCell(c ?? '', catalogue));
  const driver = expandLine(line, catalogue);
  const result = validate(driver, {
    from: LINE_ANCHOR,
    to: addDays(LINE_ANCHOR, LINE_WEEKS * 7 - 1),
  });

  const nightRest: boolean[] = [];
  const rest24: boolean[] = [];
  const workMins: number[] = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(LINE_ANCHOR, LINE_STEADY_OFFSET + d);
    const st = result.stats[date];
    nightRest.push(st.nightRestBreak);
    rest24.push(st.rest24);
    workMins.push(st.workMins);
  }

  const findings = onePerRule(result.findings);
  const errors = cells.filter((c) => c.kind === 'error').length;
  return {
    line,
    cells,
    result,
    findings,
    nightRest,
    rest24,
    workMins,
    daysOn: cells.filter((c) => c.kind === 'duty').length,
    weeklyWorkMins: workMins.reduce((a, b) => a + b, 0),
    errors,
    status: errors ? 'incomplete' : findings.some((f) => f.severity === 'violation') ? 'breach' : 'ok',
  };
}

export function blankLine(number: number): DutyLine {
  return { id: `line-${number}-${Date.now().toString(36)}`, number, week: ['', '', '', '', '', '', ''] };
}
