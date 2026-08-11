import { RULE_TEXT } from '../lib/engine';
import type { Finding } from '../lib/types';
import { fmtDayMonth } from '../lib/time';

export function FindingsPanel({ findings }: { findings: Finding[] }) {
  const violations = findings.filter((f) => f.severity === 'violation');
  const rest = findings.filter((f) => f.severity !== 'violation');

  return (
    <div className="card">
      <h2>
        {violations.length
          ? `${violations.length} BFM breach${violations.length === 1 ? '' : 'es'}`
          : 'BFM check'}
      </h2>

      {violations.length === 0 && (
        <p className="all-clear">
          <span className="tick">✓</span> No breaches in this 21-day window.
        </p>
      )}

      {[...violations, ...rest].map((f, i) => (
        <div className={`finding ${f.severity}`} key={i}>
          <div className="bar" />
          <div>
            <h3>{f.title}</h3>
            <p>{f.detail}</p>
            {f.dates.length > 0 && f.dates.length <= 6 && (
              <p className="muted" style={{ marginTop: 4 }}>
                Days affected: {f.dates.map(fmtDayMonth).join(', ')}
              </p>
            )}
            <p className="law">{RULE_TEXT[f.ruleId].law}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
