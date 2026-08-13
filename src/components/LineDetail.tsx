import { RULE_TEXT } from '../lib/engine';
import { WEEKDAYS, validateLine, type DaylightMode, type DutyLine } from '../lib/lines';
import { fmtHours } from '../lib/time';

interface Props {
  line: DutyLine;
  mode: DaylightMode;
}

const WEEKDAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function LineDetail({ line, mode }: Props) {
  const r = validateLine(line, mode);
  const violations = r.findings.filter((f) => f.severity === 'violation');

  return (
    <div className="card line-detail">
      <div className="row" style={{ marginBottom: 4 }}>
        <span className="duty-badge" style={{ width: 36, height: 36, fontSize: 15 }}>
          {line.number}
        </span>
        <h2 style={{ margin: 0 }}>Duty {line.number}</h2>
        <div className="spacer" />
        {r.status === 'ok' && <span className="tick">✓ clear</span>}
      </div>
      <p className="muted" style={{ margin: '4px 0 16px' }}>
        {r.daysOn} days on · {fmtHours(r.weeklyWorkMins)}h a week
      </p>

      <div className="week-list">
        {WEEKDAY_LABEL.map((label, i) => {
          const cell = r.cells[i];
          return (
            <div className="week-row" key={label}>
              <span className="week-row-day">{WEEKDAYS[i]}</span>
              <span className="week-row-detail">
                {cell.kind === 'duty' ? (
                  <>
                    <span className="week-row-time">
                      {cell.start}–{cell.finish}
                    </span>
                    {cell.route && <span className="muted"> {cell.route}</span>}
                  </>
                ) : cell.kind === 'error' ? (
                  <span style={{ color: 'var(--ap-red)' }}>{cell.problem}</span>
                ) : (
                  <span className="muted">Day off</span>
                )}
              </span>
              <span className="week-row-hours">
                {cell.kind === 'duty' ? fmtHours(r.workMins[i]) : ''}
              </span>
              <span className="week-row-icons">
                {r.nightRest[i] ? '☾' : ''}
                {r.rest24[i] ? '☀️' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {r.errors > 0 && (
        <p className="muted" style={{ color: 'var(--ap-red)', marginTop: 16 }}>
          {r.errors} cell{r.errors === 1 ? '' : 's'} can't be read yet — fix those before the BFM
          check means anything for this line.
        </p>
      )}

      {violations.length === 0 && r.errors === 0 && (
        <p className="all-clear" style={{ marginTop: 16 }}>
          <span className="tick">✓</span> No BFM breaches running this line week after week.
        </p>
      )}

      {violations.map((f, i) => (
        <div className="finding violation" key={i} style={{ marginTop: i === 0 ? 16 : 0 }}>
          <div className="bar" />
          <div>
            <h3>{f.title}</h3>
            <p>{f.detail}</p>
            <p className="law">{RULE_TEXT[f.ruleId].law}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
