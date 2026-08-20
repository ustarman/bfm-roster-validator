import { describe, expect, it } from 'vitest';
import {
  LINE_ANCHOR,
  blankLine,
  catalogueFor,
  expandLine,
  normaliseRoute,
  parseCell,
  seedLines,
  validateLine,
  type DutyLine,
} from './lines';
import { parseDate } from './time';

const CAT = catalogueFor('standard');

function line(week: string[]): DutyLine {
  return { id: 'l', number: 1, week };
}

describe('the anchor the pattern is laid on', () => {
  it('is a Sunday, so the week lines up with the roster', () => {
    expect(parseDate(LINE_ANCHOR).getDay()).toBe(0);
  });
});

describe('parseCell', () => {
  it('reads a start time and a known run', () => {
    expect(parseCell('02:00 BPF-C-BPF', CAT)).toMatchObject({
      kind: 'duty',
      start: '02:00',
      finish: '13:40', // 11h40
      route: 'BPF-C-BPF',
      spanMins: 700,
    });
  });

  it('treats an empty cell and RDO alike', () => {
    for (const t of ['', '  ', 'RDO', 'R.D.O', 'r.d.o.', 'off']) {
      expect(parseCell(t, CAT).kind).toBe('off');
    }
  });

  it('accepts a spelled-out pair of times for a one-off duty', () => {
    expect(parseCell('06:00-16:00', CAT)).toMatchObject({
      kind: 'duty',
      start: '06:00',
      finish: '16:00',
      spanMins: 600,
    });
  });

  it('carries a duty over midnight', () => {
    expect(parseCell('23:00 BPF-MKY', CAT)).toMatchObject({ start: '23:00', finish: '12:45' });
    expect(parseCell('22:00-06:00', CAT).spanMins).toBe(8 * 60);
  });

  it('is forgiving about how the run name is written', () => {
    expect(normaliseRoute(' bpf - c - bpf ')).toBe('BPF-C-BPF');
    expect(parseCell('02:00 bpf - c - bpf', CAT).kind).toBe('duty');
  });

  it('says so when the run is not in the duty list', () => {
    const c = parseCell('02:00 BPF-XYZ', CAT);
    expect(c.kind).toBe('error');
    expect(c.problem).toMatch(/not in the duty list/);
  });

  it('says so when there is a time but nothing else', () => {
    expect(parseCell('02:00', CAT)).toMatchObject({ kind: 'error' });
  });
});

describe('expandLine', () => {
  it('lays the same week down three times', () => {
    const d = expandLine(line(['06:00-16:00', '', '', '', '', '', '']), CAT);
    expect(Object.keys(d.days)).toHaveLength(21);
    // Same duty on the anchor Sunday and on the Sundays a week either side.
    for (const offset of [0, 7, 14]) {
      const date = Object.keys(d.days).sort()[offset];
      expect(d.days[date]).toMatchObject({ start: '06:00', finish: '16:00' });
    }
  });

  it('turns unreadable cells into days off rather than inventing a duty', () => {
    const d = expandLine(line(['02:00 NOT-A-RUN', '', '', '', '', '', '']), CAT);
    expect(Object.values(d.days).every((x) => x.code === 'RDO')).toBe(true);
  });
});

describe('validateLine', () => {
  it('passes a line with plenty of rest', () => {
    const r = validateLine(line(['', '06:00-16:00', '06:00-16:00', '06:00-16:00', '', '', '']), 'standard');
    expect(r.status).toBe('ok');
    expect(r.daysOn).toBe(3);
  });

  it('reports each rule once, not once per repeated week', () => {
    // Seven days on with no day off at all — the same breach in every week.
    const every = '22:00-08:00';
    const r = validateLine(line([every, every, every, every, every, every, every]), 'standard');
    expect(r.status).toBe('breach');
    const ids = r.findings.map((f) => f.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('catches a breach that only exists because the week repeats', () => {
    // Saturday finishes at 08:00 Sunday and the next week's Sunday starts at
    // 12:00 — fine inside one week, but the repeat leaves only 4 hours off.
    const r = validateLine(line(['12:00-20:00', '', '', '', '', '', '22:00-08:00']), 'standard');
    expect(r.findings.some((f) => f.ruleId === 'R4_24H_REST' || f.ruleId === 'R4_24H_WORK')).toBe(true);
  });

  it('flags cells it could not read instead of judging the line', () => {
    const r = validateLine(line(['02:00 NOT-A-RUN', '', '', '', '', '', '']), 'standard');
    expect(r.status).toBe('incomplete');
    expect(r.errors).toBe(1);
  });

  it('reads the settled middle week for the per-day markers', () => {
    const r = validateLine(line(['', '06:00-16:00', '06:00-16:00', '', '', '', '']), 'standard');
    expect(r.nightRest).toHaveLength(7);
    expect(r.workMins[1]).toBe(540); // 10h span, 60-minute break
    expect(r.weeklyWorkMins).toBe(2 * 540);
  });
});

describe('the roster as it ships', () => {
  const seeded = seedLines('standard');

  it('carries all 36 linehaul duty lines', () => {
    expect(seeded).toHaveLength(36);
    expect(seeded.map((l) => l.number)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
  });

  it('reads every cell of every line without a single unknown run', () => {
    const bad: string[] = [];
    for (const l of seeded) {
      const r = validateLine(l, 'standard');
      if (r.errors) bad.push(`Duty ${l.number}: ${r.cells.filter((c) => c.kind === 'error').map((c) => c.problem).join('; ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('does the same for the daylight-saving roster', () => {
    for (const l of seedLines('daylight')) {
      expect(validateLine(l, 'daylight').errors).toBe(0);
    }
  });
});

describe('blankLine', () => {
  it('starts empty and off', () => {
    const r = validateLine(blankLine(37), 'standard');
    expect(r.daysOn).toBe(0);
    expect(r.status).toBe('ok');
  });
});
