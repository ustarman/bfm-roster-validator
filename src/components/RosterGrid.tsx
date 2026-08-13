import { DAY_CODES, type DayCode, type Driver, type ValidationResult } from '../lib/types';
import { fmtDayMonth, fmtHours, parseHHMM, todayISO, weekdayShort } from '../lib/time';

interface Props {
  driver: Driver;
  dates: string[];
  result: ValidationResult;
  /** First date of the week being planned — everything before it is history. */
  planningFrom: string;
  focusedDate: string | null;
  /** "max finish 17:05" style guidance for the focused row. */
  hint: string | null;
  onFocusDate: (date: string | null) => void;
  onChange: (date: string, field: 'start' | 'finish', value: string) => void;
}

const CODES = new Set<string>(DAY_CODES);

function cellValue(driver: Driver, date: string, field: 'start' | 'finish'): string {
  const d = driver.days[date];
  if (!d) return '';
  if (d.code) return d.code;
  return d[field] ?? '';
}

function isBadTime(driver: Driver, date: string, field: 'start' | 'finish'): boolean {
  const d = driver.days[date];
  if (!d || d.code) return false;
  const v = d[field];
  return !!v && parseHHMM(v) == null;
}

export function RosterGrid({
  driver,
  dates,
  result,
  planningFrom,
  focusedDate,
  hint,
  onFocusDate,
  onChange,
}: Props) {
  const today = todayISO();

  const rows: React.ReactNode[] = [];
  dates.forEach((date, i) => {
    const planning = date >= planningFrom;
    if (i % 7 === 0) {
      const weekNo = Math.floor(i / 7) + 1;
      rows.push(
        <tr className={`week-head${planning ? ' planning' : ''}`} key={`h${date}`}>
          <td colSpan={12}>
            {planning ? 'Week being planned' : `History — week ${weekNo} of 2`} · {fmtDayMonth(date)}
          </td>
        </tr>,
      );
    }

    const st = result.stats[date];
    const bad = result.violationDates.has(date);
    const warn = result.warningDates.has(date);
    const day = driver.days[date];
    const isCode = !!day?.code;

    rows.push(
      <tr
        className={`day${planning ? '' : ' history'}${bad ? ' violation' : warn ? ' warning' : ''}${date === today ? ' today' : ''}`}
        key={date}
      >
        <td className="num muted">{i + 1}</td>
        <td className="date">
          <span className="dow">{weekdayShort(date)}</span>
          {fmtDayMonth(date)}
        </td>
        <td>
          <input
            className={`time${isCode ? ' code' : ''}`}
            value={cellValue(driver, date, 'start')}
            placeholder="--:--"
            aria-label={`Start ${date}`}
            style={isBadTime(driver, date, 'start') ? { outline: '2px solid var(--ap-red)' } : undefined}
            onFocus={() => onFocusDate(date)}
            onBlur={() => onFocusDate(null)}
            onChange={(e) => onChange(date, 'start', e.target.value)}
          />
        </td>
        <td>
          <input
            className={`time${isCode ? ' code' : ''}`}
            value={cellValue(driver, date, 'finish')}
            placeholder="--:--"
            aria-label={`Finish ${date}`}
            style={isBadTime(driver, date, 'finish') ? { outline: '2px solid var(--ap-red)' } : undefined}
            onFocus={() => onFocusDate(date)}
            onBlur={() => onFocusDate(null)}
            onChange={(e) => onChange(date, 'finish', e.target.value)}
          />
        </td>
        <td className="num">{st.workMins ? fmtHours(st.workMins) : ''}</td>
        <td className="num muted">{st.restMins || ''}</td>
        <td>{st.nightRestBreak ? <span className="tick">✓</span> : ''}</td>
        <td>{st.rest24 ? <span className="tick">✓</span> : ''}</td>
        <td className="num muted">{fmtHours(st.since24RestMins)}</td>
        <td className="num muted">{fmtHours(st.rolling7NightMins)}</td>
        <td className="num muted">{fmtHours(st.rolling14WorkMins)}</td>
        <td>
          {bad ? <span className="flag">✕</span> : warn ? <span className="flag warn">!</span> : ''}
          {focusedDate === date && hint ? <span className="hint" style={{ marginLeft: 8 }}>{hint}</span> : null}
        </td>
      </tr>,
    );
  });

  return (
    <div className="grid-wrap">
      <table className="roster">
        <colgroup>
          <col style={{ width: 46 }} />
          <col style={{ width: 118 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 140 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Date</th>
            <th>Start</th>
            <th>Finish</th>
            <th className="num">Work hrs</th>
            <th className="num" title="Rest that must be taken inside the shift">
              Rest min
            </th>
            <th title="7 continuous hours rest between 10pm and 8am">Night rest</th>
            <th title="24 continuous hours stationary rest">24h break</th>
            <th
              className="num"
              title="Work time since the last 24-hour break — limit 84h. Resets to zero once a full 24 hours off is taken."
            >
              Since 24h
            </th>
            <th className="num" title="Long/night work time in the 7 days ending on this day — limit 36h">
              7-day night
            </th>
            <th className="num" title="Work time in the 14 days ending on this day — limit 144h">
              14-day work
            </th>
            <th />
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <p className="muted" style={{ marginTop: 10 }}>
        Type times as <code>06:00</code>, <code>0600</code> or <code>6</code>. A finish earlier than the start runs
        past midnight. Type {[...CODES].slice(0, 3).join(', ')} … for a day off.
      </p>
    </div>
  );
}

export type { DayCode };
