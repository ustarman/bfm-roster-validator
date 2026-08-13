import type { Driver } from './types';
import { validate } from './engine';
import { addDays, fmtHours, weekdayShort } from './time';
import { WEEKDAYS, validateLine, type DaylightMode, type DutyLine } from './lines';

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per driver per day, plus the rule status the app worked out. */
export function toCsv(drivers: Driver[], from: string, to: string): string {
  const head = [
    'Driver',
    'Day',
    'Date',
    'Start',
    'Finish',
    'Code',
    'Work hours',
    'In-shift rest (min)',
    'Night rest break',
    '24h break',
    'Hrs since 24h break',
    '7-day long/night hrs',
    '14-day work hrs',
    'Status',
  ];
  const lines = [head.join(',')];

  for (const d of drivers) {
    const res = validate(d, { from, to });
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const day = d.days[date];
      const st = res.stats[date];
      const status = res.violationDates.has(date)
        ? res.findings
            .filter((f) => f.severity === 'violation' && f.dates.includes(date))
            .map((f) => f.title)
            .join('; ')
        : res.warningDates.has(date)
          ? 'Check'
          : 'OK';
      lines.push(
        [
          d.name,
          weekdayShort(date),
          date,
          day?.start ?? '',
          day?.finish ?? '',
          day?.code ?? '',
          st.workMins ? fmtHours(st.workMins) : '',
          st.restMins || '',
          st.nightRestBreak ? 'Y' : '',
          st.rest24 ? 'Y' : '',
          fmtHours(st.since24RestMins),
          fmtHours(st.rolling7NightMins),
          fmtHours(st.rolling14WorkMins),
          status,
        ]
          .map(esc)
          .join(','),
      );
    }
  }
  return lines.join('\n');
}

/** One row per line per weekday, using the settled (repeat-steady) week. */
export function linesToCsv(lines: DutyLine[], mode: DaylightMode): string {
  const head = ['Duty', ...WEEKDAYS.map((d) => `${d} start`), ...WEEKDAYS.map((d) => `${d} hrs`), 'Weekly hrs', 'Status'];
  const rows = [head.join(',')];

  for (const line of lines) {
    const r = validateLine(line, mode);
    const status =
      r.status === 'incomplete'
        ? `${r.errors} unreadable cell(s)`
        : r.status === 'breach'
          ? r.findings.map((f) => f.title).join('; ')
          : 'OK';
    rows.push(
      [
        line.number,
        ...WEEKDAYS.map((_, i) => r.cells[i].kind === 'duty' ? `${r.cells[i].start} ${r.cells[i].route ?? ''}`.trim() : ''),
        ...WEEKDAYS.map((_, i) => (r.cells[i].kind === 'duty' ? fmtHours(r.workMins[i]) : '')),
        fmtHours(r.weeklyWorkMins),
        status,
      ]
        .map(esc)
        .join(','),
    );
  }
  return rows.join('\n');
}

export function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
