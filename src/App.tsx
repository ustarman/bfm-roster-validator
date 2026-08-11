import { useEffect, useMemo, useState } from 'react';
import { Swoosh } from './components/Swoosh';
import { RosterGrid } from './components/RosterGrid';
import { FindingsPanel } from './components/FindingsPanel';
import { RulesHelp } from './components/RulesHelp';
import { ImportDialog } from './components/ImportDialog';
import { ConfirmDialog, PromptDialog } from './components/Dialog';
import { validate } from './lib/engine';
import { earliestStart, latestFinish } from './lib/suggest';
import { download, toCsv } from './lib/csv';
import { load, newDriver, save, setDay, type AppState } from './lib/storage';
import { DAY_CODES, type Driver, type RosterDay } from './lib/types';
import { addDays, fmtDayMonth, todayISO, weekStart } from './lib/time';

const CODES = new Set<string>(DAY_CODES);
/** Two weeks of history plus the week being planned. */
const HISTORY_WEEKS = 2;
const WINDOW_DAYS = (HISTORY_WEEKS + 1) * 7;

/** window.prompt/confirm are blocked in some embedded browser contexts, so
 *  driver-management actions go through an in-app dialog instead. */
type DialogState =
  | { kind: 'add-driver' }
  | { kind: 'rename-driver' }
  | { kind: 'remove-driver' }
  | { kind: 'clear-week' }
  | null;

export default function App() {
  const [state, setState] = useState<AppState>(() => load());
  const [showRules, setShowRules] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => save(state), [state]);

  const driver =
    state.drivers.find((d) => d.id === state.selectedDriverId) ?? state.drivers[0];

  const planningFrom = state.planningWeekStart;
  const windowFrom = addDays(planningFrom, -HISTORY_WEEKS * 7);
  const windowTo = addDays(planningFrom, 6);
  const win = useMemo(() => ({ from: windowFrom, to: windowTo }), [windowFrom, windowTo]);

  const dates = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) out.push(addDays(windowFrom, i));
    return out;
  }, [windowFrom]);

  const result = useMemo(() => validate(driver, win), [driver, win]);

  /** Per-driver status dots on the tabs. */
  const driverStatus = useMemo(() => {
    const map: Record<string, 'ok' | 'warn' | 'bad'> = {};
    for (const d of state.drivers) {
      const r = validate(d, win);
      map[d.id] = r.findings.some((f) => f.severity === 'violation')
        ? 'bad'
        : r.findings.some((f) => f.severity === 'warning')
          ? 'warn'
          : 'ok';
    }
    return map;
  }, [state.drivers, win]);

  /** "Latest finish 17:05" / "Earliest start 05:30" for the row being edited. */
  const hint = useMemo(() => {
    if (!focusedDate) return null;
    const day = driver.days[focusedDate];
    if (day?.code) return null;
    if (day?.start) {
      const late = latestFinish(driver, focusedDate, day.start, win);
      if (late) return `latest finish ${late.finish}`;
      return 'no legal finish — fix the earlier days first';
    }
    const early = earliestStart(driver, focusedDate, win);
    return early ? `earliest start ${early}` : null;
  }, [focusedDate, driver, win]);

  function updateDriver(next: Driver) {
    setState((s) => ({ ...s, drivers: s.drivers.map((d) => (d.id === next.id ? next : d)) }));
  }

  function onCellChange(date: string, field: 'start' | 'finish', value: string) {
    const upper = value.trim().toUpperCase();
    if (CODES.has(upper)) {
      updateDriver(setDay(driver, date, { code: upper as never, start: null, finish: null }));
    } else {
      updateDriver(setDay(driver, date, { code: null, [field]: value.trim() || null }));
    }
  }

  function onImport(days: RosterDay[]) {
    let next = driver;
    for (const d of days) {
      if (d.date < windowFrom || d.date > windowTo) continue;
      next = setDay(next, d.date, { start: d.start, finish: d.finish, code: d.code });
    }
    updateDriver(next);
    setShowImport(false);
  }

  function addDriver(name: string) {
    const d = newDriver(name);
    setState((s) => ({ ...s, drivers: [...s.drivers, d], selectedDriverId: d.id }));
    setDialog(null);
  }

  function renameDriver(name: string) {
    updateDriver({ ...driver, name });
    setDialog(null);
  }

  function removeDriver() {
    setState((s) => {
      const drivers = s.drivers.filter((d) => d.id !== driver.id);
      return { ...s, drivers, selectedDriverId: drivers[0].id };
    });
    setDialog(null);
  }

  function clearWeek() {
    let next = driver;
    for (let i = 0; i < 7; i++) {
      next = setDay(next, addDays(planningFrom, i), { start: null, finish: null, code: null });
    }
    updateDriver(next);
    setDialog(null);
  }

  const violations = result.findings.filter((f) => f.severity === 'violation').length;

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="app-bar">
            <span className="logo-chip">
              <img src="/assets/auspost-logo.jpg" alt="Australia Post" width={26} height={26} style={{ objectFit: 'cover' }} />
            </span>
            <h1>BFM Roster Validator</h1>
            <div className="spacer" />
            <button className="btn ghost small" onClick={() => setShowRules(true)}>
              Rules
            </button>
          </div>
          <p className="headline">
            {violations
              ? `${violations} BFM breach${violations === 1 ? '' : 'es'} in ${driver.name}'s roster`
              : `${driver.name}'s roster is within BFM limits`}
          </p>
          <p className="headline-sub">
            Planning week of {fmtDayMonth(planningFrom)} · checked against the {HISTORY_WEEKS} weeks before it
          </p>
        </div>
        <Swoosh />
      </header>

      <main className="shell">
        <div className="card">
          <div className="row">
            <div className="driver-tabs">
              {state.drivers.map((d) => (
                <button
                  className={`driver-tab${d.id === driver.id ? ' active' : ''}`}
                  key={d.id}
                  onClick={() => setState((s) => ({ ...s, selectedDriverId: d.id }))}
                >
                  <span className={`dot ${driverStatus[d.id] === 'bad' ? 'bad' : driverStatus[d.id] === 'warn' ? 'warn' : ''}`} />
                  {d.name}
                </button>
              ))}
              <button className="driver-tab" onClick={() => setDialog({ kind: 'add-driver' })}>
                + Driver
              </button>
            </div>
            <div className="spacer" />
            <button className="btn ghost small" onClick={() => setDialog({ kind: 'rename-driver' })}>
              Rename
            </button>
            <button
              className="btn ghost small"
              onClick={() => setDialog({ kind: 'remove-driver' })}
              disabled={state.drivers.length === 1}
            >
              Remove
            </button>
          </div>
        </div>

        <div className="card">
          <div className="row">
            <div>
              <label className="field-label" htmlFor="week">
                Week being planned (starts Sunday)
              </label>
              <input
                id="week"
                className="text-input"
                type="date"
                value={planningFrom}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    planningWeekStart: weekStart(e.target.value || todayISO()),
                  }))
                }
              />
            </div>
            <div className="spacer" />
            <button className="btn ghost small" onClick={() => setShowImport(true)}>
              Paste from Excel
            </button>
            <button
              className="btn ghost small"
              onClick={() => download(`bfm-${planningFrom}.csv`, toCsv(state.drivers, windowFrom, windowTo))}
            >
              Export CSV
            </button>
            <button className="btn ghost small" onClick={() => setDialog({ kind: 'clear-week' })}>
              Clear week
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <RosterGrid
              driver={driver}
              dates={dates}
              result={result}
              planningFrom={planningFrom}
              focusedDate={focusedDate}
              hint={hint}
              onFocusDate={setFocusedDate}
              onChange={onCellChange}
            />
          </div>
        </div>

        <FindingsPanel findings={result.findings} />
      </main>

      {showRules && <RulesHelp onClose={() => setShowRules(false)} />}
      {showImport && (
        <ImportDialog
          windowDates={dates}
          driverName={driver.name}
          onCancel={() => setShowImport(false)}
          onImport={onImport}
        />
      )}

      {dialog?.kind === 'add-driver' && (
        <PromptDialog
          title="Driver name"
          confirmLabel="Add"
          onCancel={() => setDialog(null)}
          onSubmit={addDriver}
        />
      )}
      {dialog?.kind === 'rename-driver' && (
        <PromptDialog
          title="Rename driver"
          initial={driver.name}
          confirmLabel="Save"
          onCancel={() => setDialog(null)}
          onSubmit={renameDriver}
        />
      )}
      {dialog?.kind === 'remove-driver' && (
        <ConfirmDialog
          title="Remove driver"
          message={`Remove ${driver.name} and their roster data? This can't be undone.`}
          confirmLabel="Remove"
          onCancel={() => setDialog(null)}
          onConfirm={removeDriver}
        />
      )}
      {dialog?.kind === 'clear-week' && (
        <ConfirmDialog
          title="Clear the planning week"
          message="Clear every entry in the week being planned? History weeks are untouched."
          confirmLabel="Clear"
          onCancel={() => setDialog(null)}
          onConfirm={clearWeek}
        />
      )}
    </>
  );
}
