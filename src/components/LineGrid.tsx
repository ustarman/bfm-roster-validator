import { WEEKDAYS, catalogueFor, validateLine, type DaylightMode, type DutyLine } from '../lib/lines';
import { fmtHours } from '../lib/time';

interface Props {
  lines: DutyLine[];
  mode: DaylightMode;
  selectedLineId: string | null;
  onSelect: (id: string) => void;
  onChange: (lineId: string, dayIndex: number, value: string) => void;
}

export function LineGrid({ lines, mode, selectedLineId, onSelect, onChange }: Props) {
  const catalogue = catalogueFor(mode);

  return (
    <div className="grid-wrap">
      <table className="roster lines">
        <colgroup>
          <col style={{ width: 66 }} />
          {WEEKDAYS.map((d) => (
            <col key={d} style={{ width: 195 }} />
          ))}
          <col style={{ width: 64 }} />
          <col style={{ width: 84 }} />
          <col style={{ width: 40 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="num">Duty</th>
            {WEEKDAYS.map((d) => (
              <th key={d}>{d}</th>
            ))}
            <th className="num" title="Days worked in the week">
              On
            </th>
            <th className="num" title="Total work time for the week">
              Hours
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const r = validateLine(line, mode);
            const selected = line.id === selectedLineId;
            return (
              <tr
                key={line.id}
                className={`day line-row${selected ? ' selected' : ''}${r.status === 'breach' ? ' violation' : r.status === 'incomplete' ? ' warning' : ''}`}
                onClick={() => onSelect(line.id)}
              >
                <td className="num">
                  <span className="duty-badge">{line.number}</span>
                </td>
                {WEEKDAYS.map((_, i) => {
                  const cell = r.cells[i];
                  const bad = cell.kind === 'error';
                  return (
                    <td key={i}>
                      <input
                        className={`time line-cell${cell.kind === 'off' ? ' code' : ''}${bad ? ' bad' : ''}`}
                        value={line.week[i] ?? ''}
                        placeholder="RDO"
                        aria-label={`Duty ${line.number} ${WEEKDAYS[i]}`}
                        title={
                          bad
                            ? cell.problem
                            : cell.kind === 'duty'
                              ? `${cell.route ?? ''} · finishes ${cell.finish} · ${fmtHours(r.workMins[i])} work`.trim()
                              : undefined
                        }
                        onClick={(e) => e.stopPropagation()}
                        onFocus={() => onSelect(line.id)}
                        onChange={(e) => onChange(line.id, i, e.target.value)}
                      />
                    </td>
                  );
                })}
                <td className="num muted">{r.daysOn}</td>
                <td className="num">{r.weeklyWorkMins ? fmtHours(r.weeklyWorkMins) : ''}</td>
                <td className="center">
                  {r.status === 'breach' && <span className="flag">✕</span>}
                  {r.status === 'incomplete' && <span className="flag warn">?</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 10 }}>
        Type a start time and a run name, e.g. <code>02:00 BPF-C-BPF</code> — the finish and work
        hours follow from the duty list ({Object.keys(catalogue).length} known runs). A start and
        finish spelled out, e.g. <code>06:00-16:00</code>, works for a one-off. Blank or{' '}
        <code>RDO</code> is a day off.
      </p>
    </div>
  );
}
