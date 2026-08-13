import { useEffect, useMemo, useState } from 'react';
import { Swoosh } from './components/Swoosh';
import { RosterGrid } from './components/RosterGrid';
import { FindingsPanel } from './components/FindingsPanel';
import { DriverSummary } from './components/DriverSummary';
import { RulesHelp } from './components/RulesHelp';
import { ImportDialog } from './components/ImportDialog';
import { ConfirmDialog, PromptDialog } from './components/Dialog';
import { LineGrid } from './components/LineGrid';
import { LineDetail } from './components/LineDetail';
import { validate } from './lib/engine';
import { earliestStart, latestFinish } from './lib/suggest';
import { download, linesToCsv, toCsv } from './lib/csv';
import { blankLine, seedLines, validateLine, type DaylightMode, type DutyLine } from './lib/lines';
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
  | { kind: 'reset-lines' }
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

  /* ------------------------------------------------------------ duty lines */

  const lineMode = state.lineDaylightMode;
  const currentLines = state.lines[lineMode];
  const selectedLine = currentLines.find((l) => l.id === state.selectedLineId) ?? currentLines[0];

  const lineSummary = useMemo(() => {
    let breach = 0;
    let incomplete = 0;
    for (const l of currentLines) {
      const status = validateLine(l, lineMode).status;
      if (status === 'breach') breach++;
      else if (status === 'incomplete') incomplete++;
    }
    return { total: currentLines.length, breach, incomplete, ok: currentLines.length - breach - incomplete };
  }, [currentLines, lineMode]);

  function updateLines(mode: DaylightMode, next: DutyLine[]) {
    setState((s) => ({ ...s, lines: { ...s.lines, [mode]: next } }));
  }

  function onLineCellChange(lineId: string, dayIndex: number, value: string) {
    updateLines(
      lineMode,
      currentLines.map((l) => (l.id === lineId ? { ...l, week: l.week.map((c, i) => (i === dayIndex ? value : c)) } : l)),
    );
  }

  function switchLineMode(next: DaylightMode) {
    setState((s) => ({ ...s, lineDaylightMode: next, selectedLineId: s.lines[next][0]?.id ?? null }));
  }

  function addLine() {
    const nextNumber = Math.max(0, ...currentLines.map((l) => l.number)) + 1;
    const l = blankLine(nextNumber);
    updateLines(lineMode, [...currentLines, l]);
    setState((s) => ({ ...s, selectedLineId: l.id }));
  }

  function resetLines() {
    updateLines(lineMode, seedLines(lineMode));
    setDialog(null);
  }

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="app-bar">
            <span className="logo-chip">
              <img
                src={`${import.meta.env.BASE_URL}assets/auspost-logo.jpg`}
                alt="Australia Post"
                width={30}
                height={30}
                style={{ objectFit: 'cover' }}
              />
            </span>
            <h1>BFM Roster Validator</h1>
            <div className="spacer" />
            <button className="btn ghost" onClick={() => setShowRules(true)}>
              Rules
            </button>
          </div>
          <p className="headline">
            {state.appMode === 'drivers'
              ? violations
                ? `${violations} BFM breach${violations === 1 ? '' : 'es'} in ${driver.name}'s roster`
                : `${driver.name}'s roster is within BFM limits`
              : lineSummary.breach
                ? `${lineSummary.breach} of ${lineSummary.total} duty lines breach BFM`
                : `All ${lineSummary.total} duty lines are within BFM limits`}
          </p>
          <p className="headline-sub">
            {state.appMode === 'drivers'
              ? `Planning week of ${fmtDayMonth(planningFrom)} · checked against the ${HISTORY_WEEKS} weeks before it`
              : 'Linehaul duty lines · checked as a repeating weekly pattern'}
          </p>
        </div>
        <Swoosh />
      </header>

      <main className="shell">
        <div className="card">
          <div className="row">
            <div className="mode-tabs">
              <button
                className={`mode-tab${state.appMode === 'drivers' ? ' active' : ''}`}
                onClick={() => setState((s) => ({ ...s, appMode: 'drivers' }))}
              >
                Drivers
              </button>
              <button
                className={`mode-tab${state.appMode === 'lines' ? ' active' : ''}`}
                onClick={() => setState((s) => ({ ...s, appMode: 'lines' }))}
              >
                Linehaul duty lines
              </button>
            </div>
          </div>
        </div>

        {state.appMode === 'drivers' && (
          <>
            <div className="lines-layout">
              <div className="lines-main">
                <div className="card lines-toolbar">
                  <div className="row">
                    <div className="driver-tabs">
                      {state.drivers.map((d) => (
                        <button
                          className={`driver-tab${d.id === driver.id ? ' active' : ''}`}
                          key={d.id}
                          onClick={() => setState((s) => ({ ...s, selectedDriverId: d.id }))}
                        >
                          <span
                            className={`dot ${driverStatus[d.id] === 'bad' ? 'bad' : driverStatus[d.id] === 'warn' ? 'warn' : ''}`}
                          />
                          {d.name}
                        </button>
                      ))}
                      <button className="driver-tab" onClick={() => setDialog({ kind: 'add-driver' })}>
                        + Driver
                      </button>
                    </div>
                    <div className="spacer" />
                    <button className="btn ghost" onClick={() => setDialog({ kind: 'rename-driver' })}>
                      Rename
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => setDialog({ kind: 'remove-driver' })}
                      disabled={state.drivers.length === 1}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="card lines-toolbar">
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
                    <button className="btn ghost" onClick={() => setShowImport(true)}>
                      Paste from Excel
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => download(`bfm-${planningFrom}.csv`, toCsv(state.drivers, windowFrom, windowTo))}
                    >
                      Export CSV
                    </button>
                    <button className="btn ghost" onClick={() => setDialog({ kind: 'clear-week' })}>
                      Clear week
                    </button>
                  </div>
                </div>

                <div className="card lines-card">
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

              <div className="lines-side">
                <DriverSummary driverName={driver.name} result={result} />
              </div>
            </div>

            <FindingsPanel findings={result.findings} />
          </>
        )}

        {state.appMode === 'lines' && selectedLine && (
          <div className="lines-layout">
            <div className="lines-main">
              <div className="card lines-toolbar">
                <div className="row">
                  <div className="mode-tabs">
                    <button
                      className={`mode-tab${lineMode === 'standard' ? ' active' : ''}`}
                      onClick={() => switchLineMode('standard')}
                    >
                      Standard
                    </button>
                    <button
                      className={`mode-tab${lineMode === 'daylight' ? ' active' : ''}`}
                      onClick={() => switchLineMode('daylight')}
                    >
                      Daylight saving
                    </button>
                  </div>
                  <div className="spacer" />
                  <button className="btn ghost" onClick={addLine}>
                    + Line
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => download(`bfm-linehaul-${lineMode}.csv`, linesToCsv(currentLines, lineMode))}
                  >
                    Export CSV
                  </button>
                  <button className="btn ghost" onClick={() => setDialog({ kind: 'reset-lines' })}>
                    Reset to spreadsheet
                  </button>
                </div>

                <div className="summary-strip">
                  <div className="summary-stat">
                    <span className="n">{lineSummary.total}</span>
                    <span className="l">duty lines</span>
                  </div>
                  <div className="summary-stat">
                    <span className="n bad">{lineSummary.breach}</span>
                    <span className="l">breach BFM</span>
                  </div>
                  <div className="summary-stat">
                    <span className="n warn">{lineSummary.incomplete}</span>
                    <span className="l">need attention</span>
                  </div>
                  <div className="summary-stat">
                    <span className="n" style={{ color: 'var(--green)' }}>
                      {lineSummary.ok}
                    </span>
                    <span className="l">clear</span>
                  </div>
                </div>
              </div>

              <div className="card lines-card">
                <LineGrid
                  lines={currentLines}
                  mode={lineMode}
                  selectedLineId={selectedLine.id}
                  onSelect={(id) => setState((s) => ({ ...s, selectedLineId: id }))}
                  onChange={onLineCellChange}
                />
              </div>
            </div>

            <div className="lines-side">
              <LineDetail line={selectedLine} mode={lineMode} />
            </div>
          </div>
        )}
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
      {dialog?.kind === 'reset-lines' && (
        <ConfirmDialog
          title="Reset to the spreadsheet"
          message={`Discard your edits to the ${lineMode === 'daylight' ? 'daylight saving' : 'standard'} lines and reload the 36 duties from the PAYS roster? This can't be undone.`}
          confirmLabel="Reset"
          onCancel={() => setDialog(null)}
          onConfirm={resetLines}
        />
      )}
    </>
  );
}
