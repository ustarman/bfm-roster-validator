/** Date / time helpers. Everything is computed in the browser's local time zone,
 *  which for this app is the driver's base time zone. */

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** 'YYYY-MM-DD' -> Date at local midnight. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Date -> 'YYYY-MM-DD' (local). */
export function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

/** Local midnight of `iso` as epoch ms. */
export function dayStartMs(iso: string): number {
  return parseDate(iso).getTime();
}

/** Epoch ms for `iso` at `mins` minutes past local midnight (handles > 24h). */
export function dateTimeMs(iso: string, mins: number): number {
  const d = parseDate(iso);
  d.setMinutes(d.getMinutes() + mins);
  return d.getTime();
}

/** 'HH:mm' (also accepts 'H:mm', 'HH:mm:ss', 'HHmm', '7', '07.30') -> minutes past midnight, or null. */
export function parseHHMM(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = /^(\d{1,2})\s*[:.]\s*(\d{1,2})(?:\s*[:.]\s*\d{1,2})?$/.exec(s);
  if (!m) m = /^(\d{1,2})(\d{2})$/.exec(s);
  if (!m) {
    const h = /^(\d{1,2})$/.exec(s);
    if (h) {
      const hh = Number(h[1]);
      return hh >= 0 && hh <= 23 ? hh * 60 : null;
    }
    return null;
  }
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

export function fmtHHMM(mins: number | null): string {
  if (mins == null) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(mins / 60) % 24)}:${p(mins % 60)}`;
}

/** 755 -> "12h 35m", 0 -> "0h" */
export function fmtDuration(mins: number): string {
  const r = Math.round(mins);
  const h = Math.floor(Math.abs(r) / 60);
  const m = Math.abs(r) % 60;
  const sign = r < 0 ? '-' : '';
  return m ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
}

/** Decimal hours, 1 dp — matches how rosters usually total up. */
export function fmtHours(mins: number): string {
  return (Math.round((mins / 60) * 10) / 10).toFixed(1);
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export function weekdayShort(iso: string): string {
  return WEEKDAYS[parseDate(iso).getDay()];
}

/** 'YYYY-MM-DD' -> '9 Aug' */
export function fmtDayMonth(iso: string): string {
  const d = parseDate(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fmtDayMonth(fmtDate(d))} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The Sunday on or before `iso` — roster weeks run SUN..SAT. */
export function weekStart(iso: string): string {
  const d = parseDate(iso);
  return addDays(iso, -d.getDay());
}

export function todayISO(): string {
  return fmtDate(new Date());
}
