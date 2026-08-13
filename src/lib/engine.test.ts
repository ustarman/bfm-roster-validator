import { describe, expect, it } from 'vitest';
import { shiftRest } from './inshift';
import { LIMITS, buildSegments, validate, workingDays } from './engine';
import type { Driver, RosterDay, RuleId } from './types';
import { addDays, parseHHMM } from './time';

/* --------------------------------------------------------------- helpers */

const START = '2026-08-09'; // a Sunday, matching the roster week in the source sheet

function driver(shifts: Record<string, [string, string] | 'RDO'>): Driver {
  const days: Record<string, RosterDay> = {};
  for (const [date, v] of Object.entries(shifts)) {
    days[date] =
      v === 'RDO'
        ? { date, start: null, finish: null, code: 'RDO' }
        : { date, start: v[0], finish: v[1], code: null };
  }
  return { id: 'd1', name: 'Test', days };
}

/** n days of the same shift starting on `from`. */
function repeat(from: string, n: number, start: string, finish: string) {
  const out: Record<string, [string, string]> = {};
  for (let i = 0; i < n; i++) out[addDays(from, i)] = [start, finish];
  return out;
}

function run(d: Driver, days = 21) {
  return validate(d, { from: START, to: addDays(START, days - 1) });
}

function rules(d: Driver, days = 21): RuleId[] {
  return run(d, days)
    .findings.filter((f) => f.severity === 'violation')
    .map((f) => f.ruleId);
}

/* ------------------------------------------------------- time parsing */

describe('parseHHMM', () => {
  it('reads the formats a planner actually types', () => {
    expect(parseHHMM('00:15')).toBe(15);
    expect(parseHHMM('00:15:00')).toBe(15); // straight out of Excel
    expect(parseHHMM('11:40')).toBe(700);
    expect(parseHHMM('0015')).toBe(15);
    expect(parseHHMM('7')).toBe(420);
    expect(parseHHMM('07.30')).toBe(450);
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM('RDO')).toBeNull();
    expect(parseHHMM('25:00')).toBeNull();
  });
});

/* ------------------------------------------------- in-shift rest table */

describe('in-shift rest', () => {
  it('gives every span in the PAYS linehaul roster the break it actually carries', () => {
    // Sampled straight from the roster: these are the only durations it uses.
    for (const span of [8 * 60 + 40, 9 * 60 + 10, 9 * 60 + 25, 9 * 60 + 45, 10 * 60 + 30]) {
      expect(shiftRest(span).restMins).toBe(30);
    }
    for (const span of [11 * 60 + 40, 12 * 60 + 30, 13 * 60 + 45, 14 * 60 + 45]) {
      expect(shiftRest(span).restMins).toBe(60);
    }
  });

  it('switches to the hour once 30 minutes would leave more than 11 hours work', () => {
    // The regulation caps work at 11h in any 12h period, so 11h30 of span is
    // the last point a 30-minute break can cover.
    expect(shiftRest(11 * 60 + 30)).toEqual({ restMins: 30, workMins: 11 * 60 });
    expect(shiftRest(11 * 60 + 35).restMins).toBe(60);
  });

  it('clears the regulation\'s own in-shift rest requirements', () => {
    for (const [span, required] of [
      [6 * 60 + 15, 15],
      [9 * 60, 30],
      [12 * 60, 60],
    ]) {
      expect(shiftRest(span).restMins).toBeGreaterThanOrEqual(required);
    }
  });

  it('does not cap work time — a span too long to be legal stays too long', () => {
    // Absorbing the excess into a longer break would hide a real breach of the
    // 24-hour rule behind rest the roster does not actually give.
    expect(shiftRest(16 * 60).workMins).toBe(15 * 60);
    expect(shiftRest(16 * 60).workMins).toBeGreaterThan(LIMITS.work24);
  });

  it('asks for no break on a span too short to need one', () => {
    expect(shiftRest(6 * 60)).toEqual({ restMins: 0, workMins: 360 });
    expect(shiftRest(0)).toEqual({ restMins: 0, workMins: 0 });
  });

  it('steps down at each break boundary, and that is deliberate', () => {
    // Crossing into a longer break really does mean less work: the 11h40 duty
    // is on the roster at 10h40 of work while the 11h30 one is at 11h. The
    // step is the policy, not an artefact, so it is pinned here rather than
    // smoothed away — smoothing it would over-count the single most common
    // duty on the roster (BPF-C-BPF, 11h40) and raise false breaches.
    expect(shiftRest(11 * 60 + 30).workMins).toBe(11 * 60);
    expect(shiftRest(11 * 60 + 40).workMins).toBe(10 * 60 + 40);
  });

  it('rises with the span everywhere inside a band', () => {
    for (const [from, to] of [
      [6 * 60 + 5, 11 * 60 + 30],
      [11 * 60 + 35, 24 * 60],
    ]) {
      let prev = -1;
      for (let s = from; s <= to; s += 5) {
        const w = shiftRest(s).workMins;
        expect(w).toBeGreaterThan(prev);
        prev = w;
      }
    }
  });
});

/* ------------------------------------------------------------ segments */

describe('buildSegments', () => {
  it('treats a finish at or before the start as running past midnight', () => {
    const [seg] = buildSegments([{ date: START, start: '22:00', finish: '06:00', code: null }]);
    expect((seg.endMs - seg.startMs) / 3_600_000).toBe(8);
  });

  it('derives work time as the span less the duty\'s break', () => {
    // 00:15 -> 11:40 is an 11h25 span — just inside the 30-minute band.
    const [seg] = buildSegments([{ date: START, start: '00:15', finish: '11:40', code: null }]);
    expect(seg.restMins).toBe(30);
    const spanMins = (seg.endMs - seg.startMs) / 60_000;
    expect(spanMins - seg.restMins).toBe(655); // 10h55 work
  });

  it('ignores coded days and half-filled rows', () => {
    expect(
      buildSegments([
        { date: START, start: '06:00', finish: '14:00', code: 'RDO' },
        { date: addDays(START, 1), start: '06:00', finish: null, code: null },
      ]),
    ).toHaveLength(0);
  });
});

describe('workingDays', () => {
  it('joins shifts less than 7 hours apart into one working day', () => {
    const segs = buildSegments([
      { date: START, start: '06:00', finish: '10:00', code: null },
      { date: START, start: '14:00', finish: '18:00', code: null }, // 4h gap
    ]);
    expect(workingDays(segs)).toHaveLength(1);
  });

  it('splits on a rest break of 7 hours or more', () => {
    const segs = buildSegments([
      { date: START, start: '06:00', finish: '10:00', code: null },
      { date: START, start: '17:00', finish: '20:00', code: null }, // 7h gap
    ]);
    expect(workingDays(segs)).toHaveLength(2);
  });
});

/* ------------------------------------------------- a compliant baseline */

describe('a normal roster', () => {
  const normal = driver({
    ...repeat(addDays(START, 1), 5, '06:00', '16:00'), // MON-FRI, 10h spans
    ...repeat(addDays(START, 8), 5, '06:00', '16:00'),
    ...repeat(addDays(START, 15), 5, '06:00', '16:00'),
  });

  it('raises no violations', () => {
    expect(rules(normal)).toEqual([]);
  });

  it('reports work time net of the duty\'s break', () => {
    // A 10h span sits in the 30-minute band, so 9h30 of work time.
    expect(run(normal).stats[addDays(START, 1)].workMins).toBe(570);
  });
});

/* ---------------------------------------------------- individual rules */

describe('24-hour rule — maximum work time', () => {
  it('accepts a 14-hour work day', () => {
    // 15h span less the hour's break is exactly 14h of work — right on the limit.
    const d = driver({ [addDays(START, 1)]: ['06:00', '21:00'] });
    expect(rules(d)).toEqual([]);
  });

  it('catches a single duty long enough to break the 14-hour cap', () => {
    // 16h span -> 15h work. The old model absorbed the excess into a longer
    // break and stayed silent; the roster does not give that break.
    const d = driver({ [addDays(START, 1)]: ['06:00', '22:00'] });
    expect(rules(d)).toContain('R4_24H_WORK');
  });

  it('catches two shifts inside 24 hours that add up to more than 14 hours', () => {
    const d = driver({
      [addDays(START, 1)]: ['06:00', '17:00'], // 10h30 work
      [addDays(START, 2)]: ['01:00', '08:00'], // 6h45 work, 8h after clocking off
    });
    expect(rules(d)).toContain('R4_24H_WORK');
  });

  it('reports how far over the limit the window went', () => {
    const d = driver({
      [addDays(START, 1)]: ['06:00', '17:00'],
      [addDays(START, 2)]: ['01:00', '08:00'],
    });
    const f = run(d).findings.find((x) => x.ruleId === 'R4_24H_WORK')!;
    expect(f.actualMins).toBeGreaterThan(LIMITS.work24);
    expect(f.detail).toMatch(/the limit is 14h/);
  });
});

describe('24-hour rule — 7 continuous hours rest', () => {
  it('accepts a working day that finishes within 17 hours of starting', () => {
    const d = driver({ [addDays(START, 1)]: ['06:00', '12:00'] });
    expect(rules(d)).toEqual([]);
  });

  it('catches a turnaround too short to break the working day', () => {
    // Only 5 hours between clocking off and clocking on, so the two shifts are
    // one 21-hour working day and the 7 continuous hours never happen.
    const d = driver({
      [addDays(START, 1)]: ['14:00', '22:00'],
      [addDays(START, 2)]: ['03:00', '11:00'],
    });
    expect(rules(d)).toContain('R4_24H_REST');
  });

  it('does not fire for back-to-back 14-hour days with 10 hours between them', () => {
    // The 24-hour period runs from the start of work, not from midnight.
    const d = driver(repeat(addDays(START, 1), 3, '06:00', '20:00'));
    expect(rules(d)).not.toContain('R4_24H_REST');
  });
});

describe('7-day rule — long/night work time', () => {
  it('counts work between midnight and 6am', () => {
    // An 8h span is 7h of work, of which the 00:00-06:00 stretch carries
    // 5h15 of night work; seven of those passes 36h.
    const d = driver(repeat(addDays(START, 1), 7, '00:00', '08:00'));
    expect(rules(d)).toContain('R5_7DAY_NIGHT');
  });

  it('leaves daytime work alone', () => {
    const d = driver(repeat(addDays(START, 1), 6, '08:00', '18:00'));
    expect(rules(d)).not.toContain('R5_7DAY_NIGHT');
  });

  it('counts work past the 12th hour of a working day as long work time', () => {
    const d = driver({ [addDays(START, 1)]: ['06:00', '21:00'] });
    const s = run(d).stats[addDays(START, 1)];
    // 14h work, so 2h sits beyond the 12-hour mark, none of it at night.
    expect(s.longNightMins).toBeCloseTo(120, 0);
  });

  it('catches a run of nights that crosses the 36-hour limit', () => {
    // 22:00-08:00 puts 6 hours inside the midnight-6am band each night; at
    // 5.7h of counted night work per shift, seven in a row passes 36 hours.
    const d = driver(repeat(addDays(START, 1), 7, '22:00', '08:00'));
    expect(rules(d)).toContain('R5_7DAY_NIGHT');
  });
});

describe('14-day rule — maximum work time', () => {
  it('catches more than 144 hours of work in 14 days', () => {
    // 13h spans -> 12h05 work each; 13 days running is ~157h.
    const d = driver(repeat(addDays(START, 1), 13, '06:00', '19:00'));
    expect(rules(d)).toContain('R6_14DAY_WORK');
  });

  it('stays quiet at a normal 5-day week', () => {
    const d = driver({
      ...repeat(addDays(START, 1), 5, '06:00', '16:00'),
      ...repeat(addDays(START, 8), 5, '06:00', '16:00'),
    });
    expect(rules(d)).not.toContain('R6_14DAY_WORK');
  });
});

describe('14-day rule — 24 continuous hours rest', () => {
  it('catches 14 straight days with no 24-hour break', () => {
    // 10h spans with 14h between them: never a full 24 hours off.
    const d = driver(repeat(START, 21, '06:00', '16:00'));
    expect(rules(d)).toContain('R6_84H_RESET');
  });

  it('is satisfied by a weekend off', () => {
    const d = driver({
      ...repeat(addDays(START, 1), 5, '06:00', '16:00'),
      ...repeat(addDays(START, 8), 5, '06:00', '16:00'),
      ...repeat(addDays(START, 15), 5, '06:00', '16:00'),
    });
    expect(rules(d)).not.toContain('R6_84H_RESET');
  });

  it('catches 84 hours worked with no 24-hour rest yet, even before the window has seen one', () => {
    // Regression: the 84-hour counter used to only start ticking once the
    // first 24-hour rest inside the window had already happened, so a driver
    // who blows past 84 hours before ever getting a full day off went
    // undetected. 8 x 12h spans = 88 hours, no break anywhere.
    const d = driver(repeat(START, 8, '06:00', '18:00'));
    expect(rules(d)).toContain('R6_84H_RESET');
  });

  it('does not flag a driver who is still under 84 hours with no rest yet', () => {
    // 6 x 12h spans = 66 hours — under the limit, so this must stay quiet
    // even though no 24-hour rest has occurred yet either.
    const d = driver(repeat(START, 6, '06:00', '18:00'));
    expect(rules(d)).not.toContain('R6_84H_RESET');
  });
});

describe('14-day rule — night rest breaks', () => {
  it('is satisfied by an ordinary day roster', () => {
    const d = driver(repeat(addDays(START, 1), 5, '06:00', '16:00'));
    expect(rules(d)).not.toContain('R6_NIGHT_RESTS');
  });

  it('catches a fortnight of night work with too few night rest breaks', () => {
    // 22:00-08:00 leaves no 7 continuous hours inside any 22:00-08:00 window.
    const d = driver(repeat(START, 21, '22:00', '08:00'));
    expect(rules(d)).toContain('R6_NIGHT_RESTS');
  });

  it('reports the shortfall once, not once per rolling window', () => {
    const d = driver(repeat(START, 21, '22:00', '08:00'));
    const n = run(d).findings.filter((f) => f.ruleId === 'R6_NIGHT_RESTS').length;
    expect(n).toBe(1);
  });

  it('counts a night rest break that falls on the very last day of the window', () => {
    // Regression: the last night's rest break runs to 08:00 the morning AFTER
    // the window closes. A driver working nights on days 1-7 and free on
    // 8-21 has 4 genuinely free nights (18-21), but the free interval used to
    // be clipped at the window boundary, so night 21 could never qualify and
    // the fortnight was reported one short.
    const d = driver(repeat(addDays(START, 1), 7, '22:00', '06:00'));
    const win = run(d);
    expect(win.stats[addDays(START, 20)].nightRestBreak).toBe(true);
    expect(rules(d)).not.toContain('R6_NIGHT_RESTS');
  });

  it('keeps the most severe rolling-window finding when deduping', () => {
    // 17 nights on shift means the 14-day windows see anywhere from 0 to 3
    // free nights depending on where they fall. Dedupe must report the worst
    // one (0), not whichever window the scanner happened to reach first.
    const d = driver(repeat(addDays(START, 1), 17, '22:00', '06:00'));
    const findings = run(d).findings.filter((f) => f.ruleId === 'R6_NIGHT_RESTS');
    expect(findings).toHaveLength(1);
    expect(findings[0].actualMins).toBe(0);
  });
});

/* ------------------------------------------------- cross-week detection */

describe('breaches that straddle a week boundary', () => {
  it('is caught even though neither calendar week is over the limit on its own', () => {
    // Sat + Sun either side of the week break, close enough together to bust
    // the 24-hour work limit, while each week's own total stays modest.
    const sat = addDays(START, 6);
    const sun = addDays(START, 7);
    const d = driver({
      [sat]: ['12:00', '23:00'], // 10h15 work
      [sun]: ['07:00', '14:00'], // 6h30 work, 8h after clocking off
    });
    expect(rules(d)).toContain('R4_24H_WORK');
  });
});

/* --------------------------------------------------------- data hygiene */

describe('incomplete history', () => {
  it('flags that blank leading days are being treated as rest days', () => {
    const d = driver(repeat(addDays(START, 14), 5, '06:00', '16:00'));
    const f = run(d).findings.find((x) => x.ruleId === 'DATA_SHORT_HISTORY');
    expect(f?.severity).toBe('info');
  });

  it('says nothing when the whole window is filled in', () => {
    const d = driver(repeat(START, 21, '06:00', '12:00'));
    expect(run(d).findings.some((f) => f.ruleId === 'DATA_SHORT_HISTORY')).toBe(false);
  });
});

/* ------------------------------------------- the 84-hour counter resetting */

describe('the 84-hour counter and rostered days off', () => {
  /** Days 0-4 on `before`, day 5 off, days 6-11 on `after`. */
  function withInsertedRdo(before: [string, string], after: [string, string]): Driver {
    const shifts: Record<string, [string, string] | 'RDO'> = {};
    for (let i = 0; i < 5; i++) shifts[addDays(START, i)] = before;
    shifts[addDays(START, 5)] = 'RDO';
    for (let i = 6; i < 12; i++) shifts[addDays(START, i)] = after;
    return driver(shifts);
  }

  const rdoDay = addDays(START, 5);
  const afterRdo = addDays(START, 6);

  it('resets across a day off between day shifts', () => {
    const s = run(withInsertedRdo(['06:00', '18:00'], ['06:00', '18:00'])).stats;
    expect(s[rdoDay].since24RestMins).toBe(0);
    expect(s[afterRdo].since24RestMins).toBe(s[afterRdo].workMins);
  });

  it('resets across a day off between night shifts', () => {
    // Regression: the night shift finishes at 08:00 ON the rostered day off,
    // so that day used to keep showing the pre-break total even though a full
    // 38 hours of rest followed and the counter had in fact been cleared.
    const s = run(withInsertedRdo(['22:00', '08:00'], ['22:00', '08:00'])).stats;
    expect(s[rdoDay].rest24).toBe(true);
    expect(s[rdoDay].since24RestMins).toBe(0);
  });

  it('resets when the day off straddles a change of shift pattern', () => {
    const s = run(withInsertedRdo(['14:00', '23:00'], ['00:15', '11:40'])).stats;
    expect(s[rdoDay].since24RestMins).toBe(0);
  });

  it('does NOT reset when the day off yields less than 24 continuous hours', () => {
    // Night finishing 08:00 on the day off, back on at 06:00 the next morning,
    // is only 22 hours of rest — short of the 24 the reset requires.
    const s = run(withInsertedRdo(['22:00', '08:00'], ['06:00', '18:00'])).stats;
    expect(s[rdoDay].rest24).toBe(false);
    expect(s[rdoDay].since24RestMins).toBeGreaterThan(0);
    expect(s[afterRdo].since24RestMins).toBeGreaterThan(s[rdoDay].since24RestMins);
  });

  it('keeps the rolling 14-day total climbing through a day off', () => {
    // The 84-hour counter resets; the 144-hour limit is a rolling total and
    // must not, however many days off are taken.
    const s = run(withInsertedRdo(['06:00', '18:00'], ['06:00', '18:00'])).stats;
    expect(s[afterRdo].rolling14WorkMins).toBeGreaterThan(s[rdoDay].rolling14WorkMins);
  });
});
