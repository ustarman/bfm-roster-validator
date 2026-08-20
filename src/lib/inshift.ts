/**
 * In-shift rest.
 *
 * Every duty carries a flat 60-minute break — confirmed with the depot's
 * rostering contact (2026-08-14). This is not the regulation's own minimum; a
 * duty short enough to only need 15 or 30 minutes under BFM still gets the
 * full hour as a welfare allowance. So work time is simply the span from
 * clock on to clock off, less that hour, whatever the duty's length.
 *
 * An earlier version of this file inferred a 30/60-minute split from the
 * spans in the PAYS spreadsheet, which happened to fit the data closely but
 * was wrong — the spreadsheet's own numbers turned out to reflect rostering
 * habit, not the actual rule. Confirming with the person who owns the policy
 * beat pattern-matching the data. Don't reintroduce a shorter tier without
 * checking with them again.
 *
 * The flat hour comfortably clears the regulation's own in-shift rest
 * requirements — 15 minutes past 6h15, 30 minutes past 9 hours, 60 minutes
 * past 12 — which is why those three limits are not validated separately.
 *
 * The 14-hour ceiling is deliberately *not* applied here. A span long enough to
 * push work time past 14 hours is a real breach of the 24-hour rule, and the
 * validator reports it as one rather than quietly absorbing it into a longer
 * break the roster does not actually give.
 */

/** The break every duty carries, in minutes. */
export const BREAK_MINS = 60;

export interface ShiftRest {
  /** In-shift rest, in minutes. */
  restMins: number;
  /** span - restMins. */
  workMins: number;
}

export function shiftRest(spanMins: number): ShiftRest {
  const span = Math.max(0, Math.round(spanMins));
  // A span shorter than the break itself is a data-entry slip rather than a
  // real duty; clamping keeps work time at zero instead of going negative.
  const restMins = Math.min(BREAK_MINS, span);
  return { restMins, workMins: span - restMins };
}
