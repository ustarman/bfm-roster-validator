/**
 * In-shift rest.
 *
 * Work time is the span from clock on to clock off, less the duty's break. The
 * planner types a start and a finish and the work time follows.
 *
 * How long the break is depends on how long the duty is. The sizes below are
 * taken from the PAYS linehaul roster, and they explain every one of the 153
 * duties in it: everything from 8h40 up to 10h30 carries 30 minutes, and
 * everything from 11h40 up to 14h45 carries an hour.
 *
 * The 11h30 boundary is not arbitrary. The regulation caps work at 11 hours in
 * any 12-hour period, so a 30-minute break stops being enough the moment the
 * span passes 11h30 — beyond that the duty has to give the full hour.
 *
 *   span <= 6h00   ->   no break     (under the 6¼-hour rule's reach)
 *   span <= 11h30  ->   30 minutes
 *   span >  11h30  ->   60 minutes
 *
 * These also clear the regulation's own in-shift rest requirements outright —
 * 15 minutes past 6h15, 30 minutes past 9 hours, 60 minutes past 12 — which is
 * why those three limits are not validated separately.
 *
 * The 14-hour ceiling is deliberately *not* applied here. A span long enough to
 * push work time past 14 hours is a real breach of the 24-hour rule, and the
 * validator reports it as one rather than quietly absorbing it into a longer
 * break the roster does not actually give.
 */

/** Longest span that needs no break at all, in minutes. */
export const NO_BREAK_MAX_SPAN = 6 * 60;

/** Longest span a 30-minute break covers: past this, work would top 11 hours. */
export const SHORT_BREAK_MAX_SPAN = 11 * 60 + 30;

export const SHORT_BREAK_MINS = 30;
export const LONG_BREAK_MINS = 60;

export interface ShiftRest {
  /** In-shift rest, in minutes. */
  restMins: number;
  /** span - restMins. */
  workMins: number;
}

/** The break a duty of this length carries, in minutes. */
export function breakForSpan(spanMins: number): number {
  if (spanMins <= NO_BREAK_MAX_SPAN) return 0;
  return spanMins <= SHORT_BREAK_MAX_SPAN ? SHORT_BREAK_MINS : LONG_BREAK_MINS;
}

export function shiftRest(spanMins: number): ShiftRest {
  const span = Math.max(0, Math.round(spanMins));
  const restMins = breakForSpan(span);
  return { restMins, workMins: span - restMins };
}
