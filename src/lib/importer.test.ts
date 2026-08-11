import { describe, expect, it } from 'vitest';
import { parsePaste, parseDateCell } from './importer';
import { addDays } from './time';

const START = '2026-08-02';
const WINDOW = Array.from({ length: 21 }, (_, i) => addDays(START, i));

describe('parseDateCell', () => {
  it('reads the formats Excel produces', () => {
    expect(parseDateCell('2026-08-09')).toBe('2026-08-09');
    expect(parseDateCell('9/08/2026')).toBe('2026-08-09');
    expect(parseDateCell('9-8-26')).toBe('2026-08-09');
    expect(parseDateCell('RDO')).toBeNull();
  });
});

describe('pasting the roster sheet columns', () => {
  const paste = [
    'SHIFT\tSHIFT',
    'Start\tFinish',
    'RDO\tRDO',
    '00:15:00\t11:40:00',
    '\t',
    '\t',
    '\t',
    'RDO\tRDO',
  ].join('\n');

  it('drops the sheet\'s own heading rows and lines the rest up with day 1', () => {
    const r = parsePaste(paste, WINDOW);
    expect(r.mode).toBe('positional');
    expect(r.rows[0].date).toBe(START);
    expect(r.rows[0].code).toBe('RDO');
    expect(r.rows[1]).toMatchObject({ date: addDays(START, 1), start: '00:15:00', finish: '11:40:00' });
  });

  it('keeps blank days as blank rather than shifting the rows up', () => {
    const r = parsePaste(paste, WINDOW);
    expect(r.rows[2]).toMatchObject({ date: addDays(START, 2), start: null, finish: null, code: null });
    expect(r.rows[5]).toMatchObject({ date: addDays(START, 5), code: 'RDO' });
  });

  it('never turns a column heading into a rostered day', () => {
    const r = parsePaste(paste, WINDOW);
    expect(r.rows.some((x) => x.raw.join().includes('SHIFT'))).toBe(false);
  });
});

describe('pasting without headings', () => {
  it('still lines up from the first row', () => {
    const r = parsePaste('06:00\t16:00\nRDO\tRDO', WINDOW);
    expect(r.rows[0]).toMatchObject({ date: START, start: '06:00', finish: '16:00' });
    expect(r.rows[1].code).toBe('RDO');
  });

  it('understands the day-off spellings rosters actually use', () => {
    const r = parsePaste('OFF\tOFF\nA/L\tA/L', WINDOW);
    expect(r.rows[0].code).toBe('RDO');
    expect(r.rows[1].code).toBe('AL');
  });
});

describe('pasting with a date column', () => {
  it('places rows on their own dates, in any order', () => {
    const paste = ['Date,Start,Finish', '5/08/2026,06:00,16:00', '3/08/2026,22:00,06:00'].join('\n');
    const r = parsePaste(paste, WINDOW);
    expect(r.mode).toBe('dated');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: '2026-08-05', start: '06:00', finish: '16:00' });
    expect(r.rows[1]).toMatchObject({ date: '2026-08-03', start: '22:00', finish: '06:00' });
  });
});
