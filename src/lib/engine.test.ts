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

describe('in-shift rest requirement', () => {
  it('reproduces the published BFM solo table exactly', () => {
    expect(shiftRest(6 * 60 + 15)).toEqual({ restMins: 15, workMins: 360 }); // 6h15 -> 6h
    expect(shiftRest(9 * 60)).toEqual({ restMins: 30, workMins: 510 }); // 9h -> 8h30
    expect(shiftRest(12 * 60)).toEqual({ restMins: 60, workMins: 660 }); // 12h -> 11h
  });

  it('never requires rest inside a short shift', () => {
    expect(shiftRest(6 * 60).restMins).toBe(0);
    expect(shiftRest(0).restMins).toBe(0);
  });

  it('caps work time at 14 hours however long the span is', () => {
    expect(shiftRest(20 * 60).workMins).toBe(LIMITS.work24);
    expect(shiftRest(24 * 60).workMins).toBe(LIMITS.work24);
  });

  it('is monotonic in the span', () => {
    let prev = 0;
    for (let s = 0; s <= 24 * 60; s += 5) {
      const w = shiftRest(s).workMins;
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
  });
});

/* ------------------------------------------------------------ segments */

describe('buildSegments', () => {
  it('treats a finish at or before the start as running past midnight', () => {
    const [seg] = buildSegments([{ date: START, start: '22:00', finish: '06:00', code: null }]);
    expect((seg.endMs - seg.startMs) / 3_600_000).toBe(8);
  });

  it('derives work time as span minus the rest the span forces', () => {
    // 00:15 -> 11:40 is an 11h25 span. Two 15-minute breaks are enough: the
    // 12-hour window that holds the shift also holds 35 minutes of rest either
    // side of it, so the 60-minute figure only bites at a full 12-hour span.
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

  it('reports work time net of the required in-shift rest', () => {
    // A 10h span forces 30 minutes of rest, so 9h30 of work time.
    expect(run(normal).stats[addDays(START, 1)].workMins).toBe(570);
  });
});

/* ---------------------------------------------------- individual rules */

describe('24-hour rule — maximum work time', () => {
  it('accepts a 14-hour work day', () => {
    // 15h05 span -> exactly 14h work once the required rest is taken.
    const d = driver({ [addDays(START, 1)]: ['06:00', '21:05'] });
    expect(rules(d)).toEqual([]);
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
    // 00:00-06:00 every day is 6h of night work; 7 days = 42h > 36h.
    const d = driver(repeat(addDays(START, 1), 7, '00:00', '06:00'));
    expect(rules(d)).toContain('R5_7DAY_NIGHT');
  });

  it('leaves daytime work alone', () => {
    const d = driver(repeat(addDays(START, 1), 6, '08:00', '18:00'));
    expect(rules(d)).not.toContain('R5_7DAY_NIGHT');
  });

  it('counts work past the 12th hour of a working day as long work time', () => {
    const d = driver({ [addDays(START, 1)]: ['06:00', '21:05'] });
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
