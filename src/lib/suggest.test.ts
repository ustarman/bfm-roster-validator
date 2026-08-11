import { describe, expect, it } from 'vitest';
import { earliestStart, latestFinish } from './suggest';
import { setDay } from './storage';
import type { Driver } from './types';
import { addDays } from './time';

const START = '2026-08-09';
const WIN = { from: START, to: addDays(START, 20) };

function driver(): Driver {
  return { id: 'd1', name: 'Test', days: {} };
}

describe('latestFinish', () => {
  it('runs out to the 17-hour working-day span, not just the 14-hour work cap', () => {
    // Work time caps at 14h well before that, but the 7-continuous-hours-rest
    // rule is what actually ends the working day — at 24h - 7h = 17h of span,
    // with the extra time absorbed as in-shift rest.
    const d = driver();
    const r = latestFinish(d, addDays(START, 15), '06:00', WIN);
    expect(r?.finish).toBe('23:00');
    expect(r?.spanMins).toBe(17 * 60);
  });

  it('is shortened by an adjoining shift inside the same 24-hour window', () => {
    let d = driver();
    d = setDay(d, addDays(START, 14), { start: '18:00', finish: '22:00', code: null });
    const r = latestFinish(d, addDays(START, 15), '06:00', WIN);
    expect(r).not.toBeNull();
    expect(r!.spanMins).toBeLessThan(15 * 60 + 5);
  });

  it('is not silenced by an unrelated breach elsewhere in the window', () => {
    // A pre-existing, unrelated 17h45 shift a few days later already breaches
    // the 24-hour rest rule. That should not stop the app suggesting a normal
    // finish time for a clean day.
    let d = driver();
    d = setDay(d, addDays(START, 18), { start: '00:15', finish: '18:00', code: null });
    const r = latestFinish(d, addDays(START, 15), '06:00', WIN);
    expect(r?.finish).toBe('23:00');
  });
});

describe('earliestStart', () => {
  it('is null when there is no prior shift to rest from', () => {
    expect(earliestStart(driver(), addDays(START, 1), WIN)).toBeNull();
  });

  it('is 7 hours after the previous shift ends', () => {
    let d = driver();
    d = setDay(d, START, { start: '22:00', finish: '08:00', code: null }); // ends 08:00 next day
    expect(earliestStart(d, addDays(START, 1), WIN)).toBe('15:00');
  });

  it('is null once the day has already begun after the rest is satisfied', () => {
    let d = driver();
    d = setDay(d, START, { start: '06:00', finish: '10:00', code: null });
    expect(earliestStart(d, addDays(START, 1), WIN)).toBeNull();
  });
});
