interface Block {
  title: string;
  plain: string;
  law: string;
}

const BLOCKS: Block[] = [
  {
    title: 'How work time is worked out from the times you type',
    plain:
      'The regulation fixes how much rest has to sit inside a shift purely from how long the shift is: 15 minutes once a shift passes 6h15, 30 minutes past 9 hours, 60 minutes past 12 hours. So a start and a finish are enough — work time is the span minus the rest that span forces. A 10-hour span is 9h30 of work time; a 15h05 span is 14 hours, the most a solo driver can do.',
    law: 'In any 6¼ hours: 6 hours work time. In any 9 hours: 8½ hours. In any 12 hours: 11 hours.',
  },
  {
    title: '24-hour rule — 14 hours work, 7 hours continuous rest',
    plain:
      'Across any 24 hours a driver may work 14 hours, and must get 7 unbroken hours of stationary rest. The 24 hours are counted from the moment work starts after a major break — so a working day has to finish within 17 hours of starting. If two shifts are less than 7 hours apart they count as one working day, which is how a short turnaround turns into a breach.',
    law: 'In any period of 24 hours: maximum 14 hours work time, minimum 7 continuous hours stationary rest time.',
  },
  {
    title: '7-day rule — 36 hours long/night work',
    plain:
      'Two kinds of work count towards this one: anything worked between midnight and 6am, and anything worked past the 12th hour of a working day. Ordinary daytime work does not count at all. The app adds both up over every rolling 7-day stretch, not per calendar week, so a run of nights that straddles a Sunday is still caught.',
    law: 'In any period of 7 days: maximum 36 hours long/night work time. No limit has been set on rest.',
  },
  {
    title: '14-day rule — 144 hours work',
    plain:
      'The total of all work time over any 14 consecutive days. The 14-day column in the grid shows where each day sits against it.',
    law: 'In any period of 14 days: maximum 144 hours work time.',
  },
  {
    title: '14-day rule — a 24-hour break after no more than 84 hours',
    plain:
      'Somewhere in every 14 days the driver needs a full 24 hours off, and it has to come before they have piled up 84 hours of work since the last one. Two consecutive rostered days off will normally satisfy it; so will a long weekend break.',
    law: 'In any period of 14 days: 24 continuous hours stationary rest time taken after no more than 84 hours work time.',
  },
  {
    title: '14-day rule — night rest breaks',
    plain:
      'A night rest break is 7 unbroken hours of rest taken between 10pm and 8am. Four are needed in any 14 days, and two of those four have to fall on back-to-back nights. A 24-hour break counts as one. Day rosters clear this without anyone thinking about it; night rosters are where it bites.',
    law: 'In any period of 14 days: 2 night rest breaks and 2 night rest breaks taken on consecutive days.',
  },
  {
    title: 'What the app assumes',
    plain:
      'Blank days are treated as rest days — so the two history weeks need to be filled in before the 7-day and 14-day figures mean anything. Work time assumes the driver takes exactly the rest the law requires inside the shift and no more, which is the cautious reading: if they take longer breaks, real work time is lower than shown. Times are read in the driver\'s base time zone.',
    law: 'Stationary rest time is time spent out of a regulated heavy vehicle, or in an approved sleeper berth of a stationary regulated heavy vehicle.',
  },
];

export function RulesHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <div>
            <h2>BFM solo driver rules</h2>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              What the validator checks, and how it reads each limit.
            </p>
          </div>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          {BLOCKS.map((b) => (
            <div className="rule-block" key={b.title}>
              <h3>{b.title}</h3>
              <p>{b.plain}</p>
              <p className="law">{b.law}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
