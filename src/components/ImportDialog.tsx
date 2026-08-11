import { useMemo, useState } from 'react';
import { parsePaste, toRosterDays } from '../lib/importer';
import type { RosterDay } from '../lib/types';
import { fmtDayMonth, weekdayShort } from '../lib/time';

interface Props {
  windowDates: string[];
  driverName: string;
  onCancel: () => void;
  onImport: (days: RosterDay[]) => void;
}

export function ImportDialog({ windowDates, driverName, onCancel, onImport }: Props) {
  const [text, setText] = useState('');
  const [offset, setOffset] = useState(0);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    const shifted = offset > 0 ? windowDates.slice(offset) : windowDates;
    return parsePaste(text, shifted);
  }, [text, offset, windowDates]);

  const rows = parsed?.rows.filter((r) => r.date) ?? [];

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <div>
            <h2>Paste from Excel</h2>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              Importing into <strong>{driverName}</strong>.
            </p>
          </div>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onCancel}>
            Cancel
          </button>
        </div>

        <p className="muted" style={{ marginTop: 12 }}>
          Copy the Start and Finish columns out of the roster sheet and paste them here. If the paste has a date
          column the rows land on their own dates; otherwise they fill the 21 days in order.
        </p>

        <textarea
          className="paste"
          value={text}
          autoFocus
          placeholder={'RDO\tRDO\n00:15:00\t11:40:00\n…'}
          onChange={(e) => setText(e.target.value)}
        />

        {parsed && (
          <>
            <div className="row" style={{ marginTop: 10 }}>
              {parsed.mode === 'positional' && (
                <label className="row" style={{ gap: 6 }}>
                  <span className="muted">Start from day</span>
                  <input
                    className="text-input"
                    style={{ width: 64 }}
                    type="number"
                    min={1}
                    max={windowDates.length}
                    value={offset + 1}
                    onChange={(e) => setOffset(Math.max(0, Number(e.target.value) - 1))}
                  />
                </label>
              )}
              <div className="spacer" />
              <button
                className="btn"
                disabled={!rows.length}
                onClick={() => onImport(toRosterDays(parsed.rows))}
              >
                Import {rows.length} day{rows.length === 1 ? '' : 's'}
              </button>
            </div>

            {parsed.notes.map((n) => (
              <p className="muted" key={n} style={{ margin: '6px 0 0' }}>
                {n}
              </p>
            ))}

            <table className="preview">
              <thead>
                <tr>
                  <th>Goes to</th>
                  <th>Start</th>
                  <th>Finish</th>
                  <th>Pasted</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((r, i) => (
                  <tr key={i}>
                    <td>
                      {weekdayShort(r.date!)} {fmtDayMonth(r.date!)}
                    </td>
                    <td>{r.code ?? r.start ?? '—'}</td>
                    <td>{r.code ?? r.finish ?? '—'}</td>
                    <td className="muted">{r.raw.join(' | ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
