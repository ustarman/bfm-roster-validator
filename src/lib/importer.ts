/**
 * Paste-from-Excel importer.
 *
 * Two shapes are understood:
 *   - positional: the planner copies the Start and Finish columns straight out
 *     of the roster sheet, and row order maps onto the 21 days on screen;
 *   - dated: the paste carries a date column, so rows land on their own dates
 *     regardless of order.
 */

import { DAY_CODES, type DayCode, type RosterDay } from './types';
import { fmtDate, parseHHMM } from './time';

export interface ParsedRow {
  /** Which on-screen date this row will be written to, if any. */
  date: string | null;
  start: string | null;
  finish: string | null;
  code: DayCode | null;
  raw: string[];
}

export interface ParseResult {
  mode: 'positional' | 'dated';
  rows: ParsedRow[];
  /** Rows skipped at the top because they held no times — usually column headers. */
  skipped: number;
  notes: string[];
}

const CODE_SET = new Set<string>(DAY_CODES);

function splitLines(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const useTab = text.includes('\t');
  return lines.map((l) => (useTab ? l.split('\t') : splitCsv(l)).map((c) => c.trim()));
}

/** Minimal CSV field splitter — handles quoted fields containing commas. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 'YYYY-MM-DD', 'D/M/YYYY', 'D-M-YY' and Excel's '9/08/2026' -> 'YYYY-MM-DD'. */
export function parseDateCell(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return fmtDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return fmtDate(new Date(year, Number(m[2]) - 1, Number(m[1])));
  }
  return null;
}

/** Spellings of a day off seen on real rosters, mapped to our codes. */
const CODE_ALIASES: Record<string, DayCode> = {
  OFF: 'RDO',
  DO: 'RDO',
  ADO: 'RDO',
  RD: 'RDO',
  'R/D': 'RDO',
  'A/L': 'AL',
  ANN: 'AL',
  'P/H': 'PH',
  PUB: 'PH',
  'S/L': 'SICK',
  SL: 'SICK',
  'L/S/L': 'LSL',
  TRAIN: 'TRN',
};

/** Only recognised day-off codes count — anything else is left alone so a
 *  column heading never gets imported as a rostered day. */
function asCode(v: string): DayCode | null {
  const s = v.trim().toUpperCase();
  if (CODE_SET.has(s)) return s as DayCode;
  return CODE_ALIASES[s] ?? null;
}

function isValue(v: string): boolean {
  return parseHHMM(v) != null || asCode(v) != null;
}

const HEADER_WORDS = /start|finish|shift|sign|date|day|driver|name|time|hours|rest|break/i;

function looksLikeHeading(cells: string[]): boolean {
  return cells.some((c) => HEADER_WORDS.test(c)) && !cells.some(isValue);
}

function headerIndex(cells: string[], words: string[]): number {
  return cells.findIndex((c) => words.some((w) => c.toLowerCase().includes(w)));
}

export function parsePaste(text: string, windowDates: string[]): ParseResult {
  const grid = splitLines(text).filter((r) => r.length > 0);
  const notes: string[] = [];
  if (!grid.length) return { mode: 'positional', rows: [], skipped: 0, notes: ['Nothing to import.'] };

  // Does any column hold dates? Then rows can be placed by date.
  let dateCol = -1;
  for (let c = 0; c < Math.max(...grid.map((r) => r.length)); c++) {
    const hits = grid.filter((r) => parseDateCell(r[c] ?? '')).length;
    if (hits >= Math.max(2, grid.length * 0.4)) {
      dateCol = c;
      break;
    }
  }

  // A sheet may carry more than one heading row ("SHIFT / SHIFT" above
  // "Start / Finish"), so look through the first few for the one that names
  // the columns.
  let headerRow = -1;
  let startCol = -1;
  let finishCol = -1;
  for (let i = 0; i < Math.min(4, grid.length); i++) {
    const s = headerIndex(grid[i], ['start', 'sign on']);
    const f = headerIndex(grid[i], ['finish', 'sign off', 'end']);
    if (s >= 0 && f >= 0 && s !== f) {
      headerRow = i;
      startCol = s;
      finishCol = f;
      break;
    }
  }
  const hasHeader = headerRow >= 0;
  const body = hasHeader ? grid.slice(headerRow + 1) : grid;

  if (!hasHeader) {
    // Fall back to the first two columns that actually contain times, skipping
    // any date column.
    const cols: number[] = [];
    const width = Math.max(...grid.map((r) => r.length));
    for (let c = 0; c < width; c++) {
      if (c === dateCol) continue;
      if (grid.some((r) => isValue(r[c] ?? ''))) cols.push(c);
      if (cols.length === 2) break;
    }
    startCol = cols[0] ?? 0;
    finishCol = cols[1] ?? 1;
  }

  if (dateCol >= 0) {
    const rows: ParsedRow[] = [];
    for (const r of body) {
      const date = parseDateCell(r[dateCol] ?? '');
      if (!date) continue;
      rows.push(toRow(date, r, startCol, finishCol));
    }
    notes.push(`Matched ${rows.length} rows by date.`);
    return { mode: 'dated', rows, skipped: 0, notes };
  }

  // Positional: drop leading rows that are the sheet's own column headings.
  // A genuinely blank first day is kept — only rows carrying heading words go.
  let skipped = 0;
  while (skipped < body.length && looksLikeHeading(body[skipped])) skipped++;
  const rows: ParsedRow[] = [];
  for (let i = skipped; i < body.length; i++) {
    const date = windowDates[i - skipped] ?? null;
    rows.push(toRow(date, body[i], startCol, finishCol));
  }
  if (skipped) notes.push(`Skipped ${skipped} heading row${skipped === 1 ? '' : 's'} at the top.`);
  if (rows.length > windowDates.length) {
    notes.push(`${rows.length - windowDates.length} row(s) fall past the end of the 21-day window and will be ignored.`);
  }
  notes.push('Check the dates below line up with your sheet before importing.');
  return { mode: 'positional', rows, skipped, notes };
}

function toRow(date: string | null, cells: string[], startCol: number, finishCol: number): ParsedRow {
  const rawStart = cells[startCol] ?? '';
  const rawFinish = cells[finishCol] ?? '';
  const s = parseHHMM(rawStart);
  const f = parseHHMM(rawFinish);
  const code = s == null ? asCode(rawStart) : null;
  return {
    date,
    start: s == null ? null : rawStart,
    finish: f == null ? null : rawFinish,
    code,
    raw: cells,
  };
}

/** Rows that landed on a date, converted to roster days. */
export function toRosterDays(rows: ParsedRow[]): RosterDay[] {
  const out: RosterDay[] = [];
  for (const r of rows) {
    if (!r.date) continue;
    out.push({ date: r.date, start: r.start, finish: r.finish, code: r.code });
  }
  return out;
}
