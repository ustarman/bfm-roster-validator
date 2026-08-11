/**
 * BFM (Basic Fatigue Management) solo-driver roster validator.
 *
 * Input:  a driver's rostered days — start and finish times only.
 * Output: every breach of the BFM solo work/rest limits, measured on a true
 *         sliding window rather than on calendar-week totals, so breaches that
 *         straddle a week boundary are caught.
 *
 * Rules implemented (see RULE_TEXT below for the source wording):
 *   24 hours — max 14h work time, and 7 continuous hours stationary rest
 *    7 days — max 36h long/night work time
 *   14 days — max 144h work time; 24 continuous hours rest taken after no more
 *             than 84h work; 4 night rest breaks, 2 of them on consecutive days
 *
 * Rules 1-3 (rest inside a shift) are not validated here — they are *satisfied
 * by construction*, because work time is derived as span minus the minimum rest
 * those rules force. See inshift.ts.
 */

import { shiftRest } from './inshift';
import type {
  DayStat,
  Driver,
  Finding,
  RosterDay,
  RuleId,
  ValidationResult,
  WorkSegment,
} from './types';
import { DAY, HOUR, MIN, addDays, dateTimeMs, dayStartMs, fmtDateTime, fmtDuration, fmtDate, parseHHMM } from './time';

/* ------------------------------------------------------------------ limits */

export const LIMITS = {
  /** 14 hours work time in any 24 hours. */
  work24: 14 * 60,
  /** 7 continuous hours stationary rest in any 24 hours. */
  rest24: 7 * 60,
  /** 36 hours long/night work time in any 7 days. */
  longNight7d: 36 * 60,
  /** 144 hours work time in any 14 days. */
  work14d: 144 * 60,
  /** A 24-hour continuous rest must come after no more than 84 hours work. */
  workBefore24Rest: 84 * 60,
  /** A 24-hour continuous stationary rest break. */
  rest24hBlock: 24 * 60,
  /** Night rest break: 7 continuous hours between 22:00 and 08:00. */
  nightRest: 7 * 60,
  /** Night rest breaks required in any 14 days, and how many must be consecutive. */
  nightRestsPer14d: 4,
  nightRestsConsecutive: 2,
  /** Work beyond this much in one 24-hour period becomes long work time. */
  longWorkThreshold: 12 * 60,
} as const;

export const RULE_TEXT: Record<RuleId, { title: string; law: string }> = {
  SHIFT_TOO_LONG: {
    title: 'Shift span',
    law: 'In any 24 hours a solo driver may work at most 14 hours. A span longer than that forces extra in-shift rest.',
  },
  R4_24H_WORK: {
    title: '24-hour rule — maximum work time',
    law: 'In any period of 24 hours: maximum 14 hours work time.',
  },
  R4_24H_REST: {
    title: '24-hour rule — 7 continuous hours rest',
    law: 'In any period of 24 hours: minimum 7 continuous hours stationary rest time.',
  },
  R5_7DAY_NIGHT: {
    title: '7-day rule — long/night work time',
    law: 'In any period of 7 days: maximum 36 hours long/night work time. Long/night work time is any work time between midnight and 6am, plus work time (outside midnight-6am) in excess of 12 hours of work in a 24-hour period.',
  },
  R6_14DAY_WORK: {
    title: '14-day rule — maximum work time',
    law: 'In any period of 14 days: maximum 144 hours work time.',
  },
  R6_84H_RESET: {
    title: '14-day rule — 24 continuous hours rest',
    law: 'In any period of 14 days: 24 continuous hours stationary rest time taken after no more than 84 hours work time.',
  },
  R6_NIGHT_RESTS: {
    title: '14-day rule — night rest breaks',
    law: 'In any period of 14 days: 2 night rest breaks and 2 night rest breaks taken on consecutive days. A night rest break is 7 continuous hours stationary rest between 10pm and 8am, or a 24 continuous hour stationary rest break.',
  },
  DATA_SHORT_HISTORY: {
    title: 'Not enough history',
    law: 'The 7-day and 14-day rules can only be checked when the preceding days are filled in.',
  },
};

/* ------------------------------------------------------- interval plumbing */

interface Iv {
  startMs: number;
  endMs: number;
  /** Fraction of elapsed time that counts as work. */
  factor: number;
}

/** Total weighted minutes of `ivs` falling inside [a, b). */
function integrate(ivs: Iv[], a: number, b: number): number {
  let total = 0;
  for (const iv of ivs) {
    const lo = Math.max(iv.startMs, a);
    const hi = Math.min(iv.endMs, b);
    if (hi > lo) total += ((hi - lo) / MIN) * iv.factor;
  }
  return total;
}

/** Merge overlapping / touching spans, ignoring factors. */
function mergeSpans(ivs: { startMs: number; endMs: number }[]): { startMs: number; endMs: number }[] {
  const sorted = [...ivs].sort((x, y) => x.startMs - y.startMs);
  const out: { startMs: number; endMs: number }[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.startMs <= last.endMs) last.endMs = Math.max(last.endMs, iv.endMs);
    else out.push({ startMs: iv.startMs, endMs: iv.endMs });
  }
  return out;
}

/** The gaps between work — i.e. rest — inside [rangeStart, rangeEnd]. */
function freeIntervals(
  spans: { startMs: number; endMs: number }[],
  rangeStart: number,
  rangeEnd: number,
): { startMs: number; endMs: number }[] {
  const out: { startMs: number; endMs: number }[] = [];
  let cursor = rangeStart;
  for (const s of spans) {
    if (s.endMs <= rangeStart || s.startMs >= rangeEnd) continue;
    const st = Math.max(s.startMs, rangeStart);
    if (st > cursor) out.push({ startMs: cursor, endMs: st });
    cursor = Math.max(cursor, Math.min(s.endMs, rangeEnd));
  }
  if (cursor < rangeEnd) out.push({ startMs: cursor, endMs: rangeEnd });
  return out;
}

/* --------------------------------------------------------------- segments */

/** Turn a driver's typed times into shifts on the absolute timeline. */
export function buildSegments(days: RosterDay[]): WorkSegment[] {
  const segs: WorkSegment[] = [];
  for (const d of days) {
    if (d.code) continue;
    const s = parseHHMM(d.start);
    const f = parseHHMM(d.finish);
    if (s == null || f == null) continue;
    const startMs = dateTimeMs(d.date, s);
    // A finish at or before the start means the shift runs past midnight.
    const endMs = dateTimeMs(d.date, f <= s ? f + 24 * 60 : f);
    const spanMins = (endMs - startMs) / MIN;
    if (spanMins <= 0) continue;
    const { restMins } = shiftRest(spanMins);
    segs.push({
      date: d.date,
      startMs,
      endMs,
      restMins,
      workFactor: (spanMins - restMins) / spanMins,
    });
  }
  return segs.sort((a, b) => a.startMs - b.startMs);
}

export interface WorkingDay {
  segs: WorkSegment[];
  startMs: number;
  endMs: number;
}

/**
 * Group shifts into working days. A working day ends at a major rest break —
 * 7 continuous hours or more — which is the boundary BFM uses to delimit a
 * driver's 24-hour period.
 */
export function workingDays(segs: WorkSegment[]): WorkingDay[] {
  const out: WorkingDay[] = [];
  for (const seg of segs) {
    const last = out[out.length - 1];
    if (last && seg.startMs - last.endMs < LIMITS.rest24 * MIN) {
      last.segs.push(seg);
      last.endMs = Math.max(last.endMs, seg.endMs);
    } else {
      out.push({ segs: [seg], startMs: seg.startMs, endMs: seg.endMs });
    }
  }
  return out;
}

/**
 * Split a shift into pieces and mark which pieces are long/night work time.
 *
 * A "24-hour period" for the long-work test is the block of duty between two
 * major (7 hour) rest breaks, which is how BFM bounds a driver's working day.
 * Within that block, work past the 12th hour is long work time; work between
 * midnight and 6am is night work time. The two never double-count.
 */
function longNightIntervals(segs: WorkSegment[]): Iv[] {
  const out: Iv[] = [];
  for (const { segs: group } of workingDays(segs)) {
    // Time at which cumulative work in this working day passes 12 hours.
    let cum = 0;
    let excessFrom = Infinity;
    for (const seg of group) {
      const segWork = ((seg.endMs - seg.startMs) / MIN) * seg.workFactor;
      if (cum + segWork > LIMITS.longWorkThreshold && excessFrom === Infinity) {
        const need = LIMITS.longWorkThreshold - cum; // work minutes still allowed
        excessFrom = seg.startMs + (need / seg.workFactor) * MIN;
      }
      cum += segWork;
    }

    for (const seg of group) {
      // Cut at midnight, at 06:00, and at the 12-hour crossing point.
      const cuts = new Set<number>([seg.startMs, seg.endMs]);
      if (excessFrom > seg.startMs && excessFrom < seg.endMs) cuts.add(excessFrom);
      let d = fmtDate(new Date(seg.startMs));
      for (let i = 0; i <= 2; i++) {
        for (const mark of [dayStartMs(d), dayStartMs(d) + 6 * HOUR]) {
          if (mark > seg.startMs && mark < seg.endMs) cuts.add(mark);
        }
        d = addDays(d, 1);
      }
      const points = [...cuts].sort((a, b) => a - b);
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const hour = new Date(a).getHours();
        const isNight = hour < 6;
        const isExcess = a >= excessFrom;
        if (isNight || isExcess) out.push({ startMs: a, endMs: b, factor: seg.workFactor });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------- window scanning */

interface Breach {
  startMs: number;
  endMs: number;
  actual: number;
}

/**
 * Every window of length `winMs` whose weighted total exceeds `limitMins`.
 *
 * The total over a sliding window only turns around where the work density
 * changes, so testing windows anchored at each shift edge (and each shift edge
 * pulled back by the window length) finds the true maximum exactly.
 */
function scanMaxInWindow(
  ivs: Iv[],
  winMs: number,
  limitMins: number,
  rangeStart: number,
  rangeEnd: number,
): Breach[] {
  const anchors = new Set<number>();
  for (const iv of ivs) {
    anchors.add(iv.startMs);
    anchors.add(iv.endMs - winMs);
  }
  const hits: Breach[] = [];
  for (const a of [...anchors].sort((x, y) => x - y)) {
    if (a < rangeStart || a + winMs > rangeEnd) continue;
    const actual = integrate(ivs, a, a + winMs);
    if (actual > limitMins + 1e-6) hits.push({ startMs: a, endMs: a + winMs, actual });
  }
  return mergeBreaches(hits);
}

/** Collapse overlapping breach windows down to the worst one in each cluster. */
function mergeBreaches(hits: Breach[]): Breach[] {
  const out: Breach[] = [];
  for (const h of hits.sort((a, b) => a.startMs - b.startMs)) {
    const last = out[out.length - 1];
    if (last && h.startMs <= last.endMs) {
      if (h.actual > last.actual) {
        last.startMs = h.startMs;
        last.endMs = h.endMs;
        last.actual = h.actual;
      }
    } else out.push({ ...h });
  }
  return out;
}

/**
 * Windows of length `winMs` that fail to contain `needMs` of continuous rest.
 *
 * A rest interval F satisfies a window starting at w exactly when
 * w is in [F.start + needMs - winMs, F.end - needMs]. So the windows that *are*
 * satisfied form a union of intervals, and anything left over is a breach.
 */
function scanContinuousRest(
  rests: { startMs: number; endMs: number }[],
  winMs: number,
  needMs: number,
  rangeStart: number,
  rangeEnd: number,
): { startMs: number; endMs: number }[] {
  const lastStart = rangeEnd - winMs;
  if (lastStart < rangeStart) return [];
  const ok = mergeSpans(
    rests
      .filter((r) => r.endMs - r.startMs >= needMs)
      .map((r) => ({ startMs: r.startMs + needMs - winMs, endMs: r.endMs - needMs })),
  );
  const gaps: { startMs: number; endMs: number }[] = [];
  let cursor = rangeStart;
  for (const o of ok) {
    if (o.endMs < cursor) continue;
    if (o.startMs > cursor) gaps.push({ startMs: cursor, endMs: Math.min(o.startMs, lastStart) });
    cursor = Math.max(cursor, o.endMs);
    if (cursor > lastStart) break;
  }
  if (cursor <= lastStart) gaps.push({ startMs: cursor, endMs: lastStart });
  return gaps.filter((g) => g.endMs >= g.startMs);
}

/* ---------------------------------------------------------- night rests */

/** Nights (keyed by the date the 22:00 falls on) that carry a night rest break. */
function nightRestNights(
  rests: { startMs: number; endMs: number }[],
  dates: string[],
): Set<string> {
  const out = new Set<string>();
  for (const date of dates) {
    const from = dayStartMs(date) + 22 * HOUR;
    const to = dayStartMs(addDays(date, 1)) + 8 * HOUR;
    for (const r of rests) {
      const lo = Math.max(r.startMs, from);
      const hi = Math.min(r.endMs, to);
      if (hi - lo >= LIMITS.nightRest * MIN) {
        out.add(date);
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------- validate */

export interface ValidateOptions {
  /** First date of the window under review, 'YYYY-MM-DD'. */
  from: string;
  /** Last date of the window under review, inclusive. */
  to: string;
}

export function validate(driver: Driver, opts: ValidateOptions): ValidationResult {
  const dates: string[] = [];
  for (let d = opts.from; d <= opts.to; d = addDays(d, 1)) dates.push(d);

  const days = dates.map(
    (date) => driver.days[date] ?? { date, start: null, finish: null, code: null },
  );
  const segs = buildSegments(days);

  const rangeStart = dayStartMs(opts.from);
  const rangeEnd = Math.max(
    dayStartMs(addDays(opts.to, 1)),
    segs.length ? segs[segs.length - 1].endMs : 0,
  );

  const workIvs: Iv[] = segs.map((s) => ({ startMs: s.startMs, endMs: s.endMs, factor: s.workFactor }));
  const spans = mergeSpans(segs);
  const rests = freeIntervals(spans, rangeStart, rangeEnd);
  const longNight = longNightIntervals(segs);
  const nights = nightRestNights(rests, dates);

  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  /** Roster dates whose shift touches [a, b), falling back to the calendar days. */
  const datesIn = (a: number, b: number): string[] => {
    const hit = segs.filter((s) => s.endMs > a && s.startMs < b).map((s) => s.date);
    if (hit.length) return [...new Set(hit)];
    return dates.filter((d) => dayStartMs(d) < b && dayStartMs(addDays(d, 1)) > a);
  };

  // --- 24 hours: max 14 hours work time -----------------------------------
  for (const b of scanMaxInWindow(workIvs, DAY, LIMITS.work24, rangeStart, rangeEnd)) {
    add({
      ruleId: 'R4_24H_WORK',
      severity: 'violation',
      dates: datesIn(b.startMs, b.endMs),
      title: RULE_TEXT.R4_24H_WORK.title,
      detail: `${fmtDuration(b.actual)} work time in the 24 hours from ${fmtDateTime(b.startMs)} — the limit is 14h (over by ${fmtDuration(b.actual - LIMITS.work24)}).`,
      windowStartMs: b.startMs,
      windowEndMs: b.endMs,
      actualMins: b.actual,
      limitMins: LIMITS.work24,
    });
  }

  // --- 24 hours: 7 continuous hours stationary rest ------------------------
  // The 24-hour period runs from the moment work starts after a major rest
  // break. Shifts less than 7 hours apart belong to the same working day, so
  // the 7 hours of continuous rest can only come after that working day ends —
  // which means the working day has to finish within 17 hours of starting.
  for (const g of workingDays(segs)) {
    const spanMins = (g.endMs - g.startMs) / MIN;
    const maxSpan = 24 * 60 - LIMITS.rest24;
    if (spanMins > maxSpan + 1e-6) {
      add({
        ruleId: 'R4_24H_REST',
        severity: 'violation',
        dates: [...new Set(g.segs.map((s) => s.date))],
        title: RULE_TEXT.R4_24H_REST.title,
        detail: `Only ${fmtDuration(24 * 60 - spanMins)} of continuous rest in the 24 hours from ${fmtDateTime(g.startMs)} — 7 continuous hours are required. Clock off ${fmtDuration(spanMins - maxSpan)} earlier, or start later.`,
        windowStartMs: g.startMs,
        windowEndMs: g.startMs + DAY,
        actualMins: 24 * 60 - spanMins,
        limitMins: LIMITS.rest24,
      });
    }
  }

  // --- 7 days: max 36 hours long/night work time ---------------------------
  for (const b of scanMaxInWindow(longNight, 7 * DAY, LIMITS.longNight7d, rangeStart, rangeEnd)) {
    add({
      ruleId: 'R5_7DAY_NIGHT',
      severity: 'violation',
      dates: datesIn(b.startMs, b.endMs),
      title: RULE_TEXT.R5_7DAY_NIGHT.title,
      detail: `${fmtDuration(b.actual)} long/night work time in the 7 days from ${fmtDateTime(b.startMs)} — the limit is 36h (over by ${fmtDuration(b.actual - LIMITS.longNight7d)}).`,
      windowStartMs: b.startMs,
      windowEndMs: b.endMs,
      actualMins: b.actual,
      limitMins: LIMITS.longNight7d,
    });
  }

  // --- 14 days: max 144 hours work time ------------------------------------
  for (const b of scanMaxInWindow(workIvs, 14 * DAY, LIMITS.work14d, rangeStart, rangeEnd)) {
    add({
      ruleId: 'R6_14DAY_WORK',
      severity: 'violation',
      dates: datesIn(b.startMs, b.endMs),
      title: RULE_TEXT.R6_14DAY_WORK.title,
      detail: `${fmtDuration(b.actual)} work time in the 14 days from ${fmtDateTime(b.startMs)} — the limit is 144h (over by ${fmtDuration(b.actual - LIMITS.work14d)}).`,
      windowStartMs: b.startMs,
      windowEndMs: b.endMs,
      actualMins: b.actual,
      limitMins: LIMITS.work14d,
    });
  }

  // --- 14 days: a 24-hour continuous rest must exist ------------------------
  for (const g of scanContinuousRest(rests, 14 * DAY, LIMITS.rest24hBlock * MIN, rangeStart, rangeEnd)) {
    add({
      ruleId: 'R6_84H_RESET',
      severity: 'violation',
      dates: datesIn(g.startMs, g.endMs + 14 * DAY),
      title: RULE_TEXT.R6_84H_RESET.title,
      detail: `No 24 continuous hours of rest in the 14 days from ${fmtDateTime(g.startMs)}.`,
      windowStartMs: g.startMs,
      windowEndMs: g.endMs + 14 * DAY,
    });
  }

  // --- 14 days: 24-hour rest must follow no more than 84 hours work ---------
  const rest24Blocks = rests.filter((r) => r.endMs - r.startMs >= LIMITS.rest24hBlock * MIN);
  const since24 = trackWorkBetween24hRests(workIvs, rest24Blocks, rangeStart, rangeEnd);
  for (const b of since24.breaches) {
    add({
      ruleId: 'R6_84H_RESET',
      severity: 'violation',
      dates: datesIn(b.startMs, b.endMs),
      title: RULE_TEXT.R6_84H_RESET.title,
      detail: `${fmtDuration(b.actual)} work time since the last 24-hour rest (ended ${fmtDateTime(b.startMs)}) with no 24-hour rest taken — a 24-hour continuous rest is due after 84h.`,
      windowStartMs: b.startMs,
      windowEndMs: b.endMs,
      actualMins: b.actual,
      limitMins: LIMITS.workBefore24Rest,
    });
  }

  // --- 14 days: night rest breaks -------------------------------------------
  for (let i = 0; i + 13 < dates.length; i++) {
    const win = dates.slice(i, i + 14);
    const got = win.filter((d) => nights.has(d));
    let consecutive = 0;
    for (let k = 0; k + 1 < win.length; k++) {
      if (nights.has(win[k]) && nights.has(win[k + 1])) consecutive = Math.max(consecutive, 2);
    }
    if (got.length < LIMITS.nightRestsPer14d) {
      add({
        ruleId: 'R6_NIGHT_RESTS',
        severity: 'violation',
        dates: win,
        title: RULE_TEXT.R6_NIGHT_RESTS.title,
        detail: `Only ${got.length} night rest break${got.length === 1 ? '' : 's'} in the 14 days from ${win[0]} — 4 are required (2, plus 2 taken on consecutive days).`,
        actualMins: got.length,
        limitMins: LIMITS.nightRestsPer14d,
      });
    } else if (consecutive < LIMITS.nightRestsConsecutive) {
      add({
        ruleId: 'R6_NIGHT_RESTS',
        severity: 'violation',
        dates: win,
        title: RULE_TEXT.R6_NIGHT_RESTS.title,
        detail: `No two night rest breaks on consecutive days in the 14 days from ${win[0]} — 2 of the 4 night rest breaks must be back to back.`,
      });
    }
  }
  dedupeNightRestFindings(findings);

  // --- shifts long enough that the 14-hour cap bites ------------------------
  for (const s of segs) {
    const spanMins = (s.endMs - s.startMs) / MIN;
    if (spanMins - s.restMins >= LIMITS.work24 - 1e-6 && s.restMins > 60) {
      add({
        ruleId: 'SHIFT_TOO_LONG',
        severity: 'warning',
        dates: [s.date],
        title: RULE_TEXT.SHIFT_TOO_LONG.title,
        detail: `A ${fmtDuration(spanMins)} span caps out at 14h work time, so this shift needs ${fmtDuration(s.restMins)} of rest inside it.`,
        actualMins: spanMins,
      });
    }
  }

  // --- warn when the history the rules need has not been entered ------------
  const filled = dates.filter((d) => {
    const r = driver.days[d];
    return r && (r.code || (parseHHMM(r.start) != null && parseHHMM(r.finish) != null));
  });
  if (filled.length && dates.length >= 14) {
    const firstFilled = dates.indexOf(filled[0]);
    if (firstFilled > 0) {
      add({
        ruleId: 'DATA_SHORT_HISTORY',
        severity: 'info',
        dates: dates.slice(0, firstFilled),
        title: RULE_TEXT.DATA_SHORT_HISTORY.title,
        detail: `Nothing entered before ${filled[0]}. Blank days are counted as rest days, so the 7-day and 14-day totals only become reliable once the two preceding weeks are filled in.`,
      });
    }
  }

  // --- per-day numbers -------------------------------------------------------
  const stats: Record<string, DayStat> = {};
  for (const date of dates) {
    const seg = segs.find((s) => s.date === date);
    const dStart = dayStartMs(date);
    const dEnd = dayStartMs(addDays(date, 1));
    const spanMins = seg ? (seg.endMs - seg.startMs) / MIN : 0;
    stats[date] = {
      date,
      spanMins,
      workMins: seg ? spanMins - seg.restMins : 0,
      restMins: seg ? seg.restMins : 0,
      nightWorkMins: integrate(
        workIvs.filter((iv) => iv.endMs > dStart && iv.startMs < dEnd),
        dStart,
        dStart + 6 * HOUR,
      ),
      longNightMins: integrate(longNight, dStart, dEnd),
      nightRestBreak: nights.has(date),
      rest24: rest24Blocks.some((r) => r.endMs > dStart && r.startMs < dEnd),
      rolling7NightMins: integrate(longNight, dEnd - 7 * DAY, dEnd),
      rolling14WorkMins: integrate(workIvs, dEnd - 14 * DAY, dEnd),
      since24RestMins: since24.atDayEnd.get(date) ?? 0,
    };
  }

  const violationDates = new Set<string>();
  const warningDates = new Set<string>();
  for (const f of findings) {
    for (const d of f.dates) {
      if (f.severity === 'violation') violationDates.add(d);
      else if (f.severity === 'warning') warningDates.add(d);
    }
  }
  for (const d of violationDates) warningDates.delete(d);

  return { findings, stats, violationDates, warningDates };
}

/** Only report the first (earliest) night-rest finding per rule kind — the
 *  rolling windows would otherwise repeat the same problem 14 times. */
function dedupeNightRestFindings(findings: Finding[]): void {
  let seen = false;
  for (let i = 0; i < findings.length; i++) {
    if (findings[i].ruleId !== 'R6_NIGHT_RESTS') continue;
    if (seen) findings.splice(i--, 1);
    else seen = true;
  }
}

/**
 * Walk the timeline accumulating work since the end of the last 24-hour rest.
 * History before the first 24-hour rest in range is unknown, so the counter
 * only starts there.
 */
function trackWorkBetween24hRests(
  workIvs: Iv[],
  rest24Blocks: { startMs: number; endMs: number }[],
  rangeStart: number,
  rangeEnd: number,
): { breaches: Breach[]; atDayEnd: Map<string, number> } {
  const breaches: Breach[] = [];
  const atDayEnd = new Map<string, number>();
  if (!rest24Blocks.length) return { breaches, atDayEnd };

  const bounds = [...rest24Blocks].sort((a, b) => a.startMs - b.startMs);
  let cursor = bounds[0].endMs;
  for (let i = 1; i <= bounds.length; i++) {
    const nextRestStart = i < bounds.length ? bounds[i].startMs : rangeEnd;
    const worked = integrate(workIvs, cursor, nextRestStart);
    if (worked > LIMITS.workBefore24Rest + 1e-6) {
      breaches.push({ startMs: cursor, endMs: nextRestStart, actual: worked });
    }
    for (let d = fmtDate(new Date(cursor)); dayStartMs(d) < nextRestStart; d = addDays(d, 1)) {
      const end = Math.min(dayStartMs(addDays(d, 1)), nextRestStart);
      if (dayStartMs(d) >= rangeStart) atDayEnd.set(d, integrate(workIvs, cursor, end));
    }
    if (i < bounds.length) cursor = bounds[i].endMs;
  }
  return { breaches, atDayEnd };
}
