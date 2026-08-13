import type { ValidationResult } from '../lib/types';

interface Props {
  driverName: string;
  result: ValidationResult;
}

/**
 * The at-a-glance sidebar for the Drivers screen — title and one-line detail
 * only. The full explanation, with the regulation text quoted underneath each
 * one, stays in FindingsPanel below the roster. Putting that much text in a
 * fixed-width sidebar would defeat the point of a quick-glance panel.
 */
export function DriverSummary({ driverName, result }: Props) {
  const violations = result.findings.filter((f) => f.severity === 'violation');
  const warnings = result.findings.filter((f) => f.severity === 'warning');

  return (
    <div className="card line-detail">
      <div className="row" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{driverName}</h2>
        <div className="spacer" />
        {violations.length === 0 && <span className="tick">✓ clear</span>}
      </div>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        {violations.length
          ? `${violations.length} breach${violations.length === 1 ? '' : 'es'} in this 21-day window`
          : 'Checked against the 21-day window below'}
      </p>

      {violations.length === 0 ? (
        <p className="all-clear" style={{ marginTop: 16 }}>
          <span className="tick">✓</span> No BFM breaches.
        </p>
      ) : (
        <div style={{ marginTop: 12 }}>
          {violations.map((f, i) => (
            <div className="finding violation" key={i}>
              <div className="bar" />
              <div>
                <h3>{f.title}</h3>
                <p>{f.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <p className="muted" style={{ marginTop: 14 }}>
          {warnings.length} more item{warnings.length === 1 ? '' : 's'} worth checking — see below.
        </p>
      )}

      <p className="muted" style={{ marginTop: 16 }}>
        Full explanation and the regulation text are below the roster.
      </p>
    </div>
  );
}
