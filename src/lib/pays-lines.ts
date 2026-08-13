/**
 * The PAYS linehaul roster, read straight out of the depot's spreadsheet.
 *
 * GENERATED — see CLAUDE.md. Two things come from that workbook:
 *
 *  - the duty catalogue: how long each named run takes, so a planner types
 *    "02:00 BPF-C-BPF" and the finish time follows;
 *  - the 36 duty lines themselves, as a starting point.
 *
 * Durations are the value the spreadsheet uses most often for that run. Where a
 * cell disagreed it was a one-off against dozens of consistent entries, so the
 * majority is taken as correct and the odd cell is treated as a typo.
 *
 * Two runs genuinely change with daylight saving, which is why the workbook
 * keeps two sheets and this file keeps two catalogues.
 */

/** Route name -> duty length in minutes. */
export type DutyCatalogue = Readonly<Record<string, number>>;

/** Outside daylight saving — the NON DAYLIGHT sheet. */
export const CATALOGUE_STANDARD: DutyCatalogue = {
  'BPF-C-BPF': 700,
  'BPF-GL': 520,
  'BPF-MKY': 825,
  'BPF-MRY-GLD': 520,
  'BPF-NAM-BPF': 750,
  'BPF-R': 565,
  'BPF-R-M': 885,
  'BPF-R-MKY': 825,
  'BPF-W-M-R': 630,
  'GL-BPF': 520,
  'GLD-BPF': 520,
  'M-BPF': 825,
  'MKY-BPF': 825,
  'MKY-R-BPF': 825,
  'R-BPF': 550,
  'R-GL-BPF': 585,
  'SERV': 520,
};

/** During daylight saving — the DAYLIGHT sheet. */
export const CATALOGUE_DAYLIGHT: DutyCatalogue = {
  'BPF-C-BPF': 700,
  'BPF-GL': 520,
  'BPF-MKY': 825,
  'BPF-MRY-GLD': 730,
  'BPF-NAM-BPF': 750,
  'BPF-R': 565,
  'BPF-R-M': 885,
  'BPF-R-MKY': 825,
  'BPF-W-M-R': 630,
  'GL-BPF': 520,
  'GLD-BPF': 760,
  'M-BPF': 825,
  'MKY-BPF': 825,
  'MKY-R-BPF': 825,
  'R-BPF': 550,
  'R-GL-BPF': 585,
  'SERV': 520,
};

/** A duty line's week, Sunday first. null is a rostered day off. */
export interface SeedLine {
  number: number;
  week: (string | null)[];
}

/** Outside daylight saving. */
export const LINES_STANDARD: readonly SeedLine[] = [
  { number: 1, week: ["23:00 BPF-MKY", "23:45 MKY-BPF", null, "02:00 BPF-C-BPF", "02:00 BPF-C-BPF", "02:00 BPF-C-BPF", null] },
  { number: 2, week: [null, null, null, "05:30 BPF-R-M", "06:45 M-BPF", "09:00 BPF-NAM-BPF", "14:00 BPF-C-BPF"] },
  { number: 3, week: [null, "23:00 BPF-MKY", "23:45 MKY-BPF", null, "01:15 BPF-C-BPF", "01:15 BPF-C-BPF", "01:15 BPF-C-BPF"] },
  { number: 4, week: [null, null, "17:30 BPF-C-BPF", "18:00 BPF-MKY", "18:45 MKY-BPF", null, "13:45 BPF-MKY"] },
  { number: 5, week: ["14:30 MKY-BPF", null, null, "01:30 BPF-R-MKY", "02:00 MKY-R-BPF", "04:00 BPF-C-BPF", "05:00 BPF-NAM-BPF"] },
  { number: 6, week: ["06:30 BPF-NAM-BPF", null, "05:00 BPF-NAM-BPF", null, "18:00 BPF-MKY", "18:45 MKY-BPF", null] },
  { number: 7, week: ["05:00 BPF-MKY", "06:45 MKY-BPF", null, null, "02:00 BPF-NAM-BPF", "02:00 BPF-NAM-BPF", "06:00 SERV"] },
  { number: 8, week: [null, "03:30 BPF-R-M", "05:15 M-BPF", "09:00 BPF-NAM-BPF", null, null, "13:45 BPF-MKY"] },
  { number: 9, week: ["14:30 MKY-BPF", null, null, "05:00 BPF-NAM-BPF", "19:15 BPF-W-M-R", "16:45 R-BPF", "15:00 BPF-NAM-BPF"] },
  { number: 10, week: [null, "19:15 BPF-W-M-R", "18:15 R-GL-BPF", "21:15 BPF-C-BPF", null, null, "04:00 BPF-C-BPF"] },
  { number: 11, week: [null, null, "04:00 BPF-C-BPF", "05:00 BPF-NAM-BPF", "05:00 BPF-NAM-BPF", "12:00 BPF-MKY", "12:45 MKY-BPF"] },
  { number: 12, week: [null, null, "21:15 BPF-C-BPF", "19:15 BPF-W-M-R", "18:15 R-GL-BPF", "21:15 BPF-C-BPF", null] },
  { number: 13, week: ["18:00 BPF-MKY", "18:45 MKY-BPF", "22:00 BPF-NAM-BPF", null, null, "05:00 BPF-NAM-BPF", "05:00 BPF-NAM-BPF"] },
  { number: 14, week: [null, "03:30 SERV", "01:30 BPF-R-MKY", "02:00 MKY-R-BPF", "05:00 BPF-NAM-BPF", null, null] },
  { number: 15, week: [null, "12:00 BPF-MKY", "12:45 MKY-BPF", "22:00 BPF-NAM-BPF", "22:00 BPF-NAM-BPF", "23:15 BPF-C-BPF", null] },
  { number: 16, week: [null, "21:15 BPF-C-BPF", "23:00 BPF-MKY", "23:45 MKY-BPF", null, null, "02:00 BPF-C-BPF"] },
  { number: 17, week: [null, null, "03:30 BPF-W-M-R", "02:00 R-BPF", "05:30 BPF-R-M", "06:45 M-BPF", "09:00 BPF-NAM-BPF"] },
  { number: 18, week: [null, "17:30 BPF-C-BPF", "18:00 BPF-MKY", "18:45 MKY-BPF", null, null, "01:00 BPF-MKY"] },
  { number: 19, week: ["01:45 MKY-BPF", null, "02:00 BPF-NAM-BPF", "02:00 BPF-NAM-BPF", null, "00:01 BPF-MKY", "01:00 MKY-BPF"] },
  { number: 20, week: [null, null, null, "04:00 BPF-C-BPF", "04:00 BPF-C-BPF", "03:30 BPF-W-M-R", "02:00 R-BPF"] },
  { number: 21, week: [null, null, "02:00 BPF-C-BPF", "03:30 BPF-W-M-R", "02:00 R-BPF", "00:15 BPF-C-BPF", "01:00 BPF-R-MKY"] },
  { number: 22, week: ["01:45 MKY-BPF", null, "09:00 BPF-NAM-BPF", "12:00 BPF-MKY", "12:45 MKY-BPF", null, null] },
  { number: 23, week: ["19:45 BPF-MKY", "20:30 MKY-BPF", null, "00:15 BPF-C-BPF", "00:15 BPF-C-BPF", null, "02:00 BPF-NAM-BPF"] },
  { number: 24, week: [null, "22:00 BPF-NAM-BPF", null, "17:30 BPF-C-BPF", "23:00 BPF-MKY", "23:45 MKY-BPF", null] },
  { number: 25, week: ["09:00 BPF-R", "05:30 R-BPF", "05:45 BPF-NAM-BPF", null, "01:30 BPF-R-MKY", "02:00 MKY-R-BPF", null] },
  { number: 26, week: [null, "00:15 BPF-C-BPF", "00:15 BPF-C-BPF", null, null, "01:30 BPF-R-MKY", "02:00 MKY-BPF"] },
  { number: 27, week: ["08:30 BPF-GL", "05:00 GL-BPF", "05:30 BPF-R-M", "06:45 M-BPF", "09:00 BPF-NAM-BPF", null, null] },
  { number: 28, week: [null, "04:00 BPF-C-BPF", "05:00 BPF-NAM-BPF", null, null, "05:00 BPF-NAM-BPF", "09:00 BPF-C-BPF"] },
  { number: 29, week: ["20:45 BPF-R", "18:15 R-GL-BPF", null, null, "12:00 BPF-MKY", "12:45 MKY-BPF", "15:00 BPF-R"] },
  { number: 30, week: ["14:00 R-GL-BPF", null, "01:00 BPF-C-BPF", "01:00 BPF-C-BPF", null, null, "13:45 BPF-MKY"] },
  { number: 31, week: ["14:30 MKY-BPF", null, "12:00 BPF-MKY", "12:45 MKY-BPF", "17:30 BPF-C-BPF", "17:30 BPF-C-BPF", null] },
  { number: 32, week: [null, null, "19:15 BPF-W-M-R", "18:15 R-GL-BPF", "21:15 BPF-C-BPF", "22:00 BPF-NAM-BPF", null] },
  { number: 33, week: ["05:00 SERV", "18:00 BPF-MKY", "18:45 MKY-BPF", "23:00 BPF-MKY", "23:45 MKY-BPF", null, null] },
  { number: 34, week: [null, "01:30 BPF-R-MKY", "02:00 MKY-R-BPF", null, "03:30 BPF-W-M-R", "02:00 R-BPF", null] },
  { number: 35, week: [null, "05:00 BPF-MRY-GLD", "01:00 GLD-BPF", "05:00 BPF-MRY-GLD", "01:00 GLD-BPF", "05:45 BPF-NAM-BPF", null] },
  { number: 36, week: [null, null, "05:00 BPF-MRY-GLD", "01:00 GLD-BPF", "05:00 BPF-MRY-GLD", "01:00 GLD-BPF", null] },
];

/** During daylight saving. */
export const LINES_DAYLIGHT: readonly SeedLine[] = [
  { number: 1, week: ["23:00 BPF-MKY", "23:45 MKY-BPF", null, "01:00 BPF-C-BPF", "01:00 BPF-C-BPF", "01:00 BPF-C-BPF", null] },
  { number: 2, week: [null, null, null, "05:30 BPF-R-M", "06:45 M-BPF", "09:00 BPF-NAM-BPF", "13:00 BPF-C-BPF"] },
  { number: 3, week: [null, "23:00 BPF-MKY", "23:45 MKY-BPF", null, "00:15 BPF-C-BPF", "00:15 BPF-C-BPF", "00:15 BPF-C-BPF"] },
  { number: 4, week: [null, null, "16:30 BPF-C-BPF", "18:00 BPF-MKY", "18:45 MKY-BPF", null, "13:45 BPF-MKY"] },
  { number: 5, week: ["14:30 MKY-BPF", null, null, "01:30 BPF-R-MKY", "02:00 MKY-R-BPF", "03:00 BPF-C-BPF", "05:00 BPF-NAM-BPF"] },
  { number: 6, week: ["06:30 BPF-NAM-BPF", null, "05:00 BPF-NAM-BPF", null, "18:00 BPF-MKY", "18:45 MKY-BPF", null] },
  { number: 7, week: ["05:00 BPF-MKY", "06:45 MKY-BPF", null, null, "01:00 BPF-NAM-BPF", "01:00 BPF-NAM-BPF", "06:00 SERV"] },
  { number: 8, week: [null, "03:30 BPF-R-M", "05:15 M-BPF", "09:00 BPF-NAM-BPF", null, null, "13:45 BPF-MKY"] },
  { number: 9, week: ["14:30 MKY-BPF", null, null, "05:00 BPF-NAM-BPF", "19:15 BPF-W-M-R", "16:45 R-BPF", "14:00 BPF-NAM-BPF"] },
  { number: 10, week: [null, "19:15 BPF-W-M-R", "18:15 R-GL-BPF", "20:15 BPF-C-BPF", null, null, "03:00 BPF-C-BPF"] },
  { number: 11, week: [null, null, "03:00 BPF-C-BPF", "05:00 BPF-NAM-BPF", "05:00 BPF-NAM-BPF", "12:00 BPF-MKY", "12:45 MKY-BPF"] },
  { number: 12, week: [null, null, "20:15 BPF-C-BPF", "19:15 BPF-W-M-R", "18:15 R-GL-BPF", "20:15 BPF-C-BPF", null] },
  { number: 13, week: ["18:00 BPF-MKY", "18:45 MKY-BPF", "21:00 BPF-NAM-BPF", null, null, "05:00 BPF-NAM-BPF", "05:00 BPF-NAM-BPF"] },
  { number: 14, week: [null, "03:30 SERV", "01:30 BPF-R-MKY", "02:00 MKY-R-BPF", "05:00 BPF-NAM-BPF", null, null] },
  { number: 15, week: [null, "12:00 BPF-MKY", "12:45 MKY-BPF", "21:00 BPF-NAM-BPF", "21:00 BPF-NAM-BPF", "23:15 BPF-C-BPF", null] },
  { number: 16, week: [null, "20:15 BPF-C-BPF", "23:00 BPF-MKY", "23:45 MKY-BPF", null, null, "01:00 BPF-C-BPF"] },
  { number: 17, week: [null, null, "03:30 BPF-W-M-R", "02:00 R-BPF", "05:30 BPF-R-M", "06:45 M-BPF", "09:00 BPF-NAM-BPF"] },
  { number: 18, week: [null, "16:30 BPF-C-BPF", "18:00 BPF-MKY", "18:45 MKY-BPF", null, null, "01:00 BPF-MKY"] },
  { number: 19, week: ["01:45 MKY-BPF", null, "01:00 BPF-NAM-BPF", "01:00 BPF-NAM-BPF", null, "00:01 BPF-MKY", "01:00 MKY-BPF"] },
  { number: 20, week: [null, null, null, "03:00 BPF-C-BPF", "03:00 BPF-C-BPF", "03:30 BPF-W-M-R", "02:00 R-BPF"] },
  { number: 21, week: [null, null, "01:00 BPF-C-BPF", "03:30 BPF-W-M-R", "02:00 R-BPF", "23:15 BPF-C-BPF", "01:00 BPF-R-MKY"] },
  { number: 22, week: ["01:45 MKY-BPF", null, "09:00 BPF-NAM-BPF", "12:00 BPF-MKY", "12:45 MKY-BPF", null, null] },
  { number: 23, week: ["19:45 BPF-MKY", "20:30 MKY-BPF", "23:15 BPF-C-BPF", "23:15 BPF-C-BPF", null, null, "01:00 BPF-NAM-BPF"] },
  { number: 24, week: [null, "21:00 BPF-NAM-BPF", null, "16:30 BPF-C-BPF", "23:00 BPF-MKY", "23:45 MKY-BPF", null] },
  { number: 25, week: ["09:00 BPF-R", "05:30 R-BPF", "05:45 BPF-NAM-BPF", null, "01:30 BPF-R-MKY", "02:00 MKY-R-BPF", null] },
  { number: 26, week: ["23:15 BPF-C-BPF", "23:15 BPF-C-BPF", null, null, null, "01:30 BPF-R-MKY", "02:00 MKY-BPF"] },
  { number: 27, week: ["08:30 BPF-GL", "05:00 GL-BPF", "05:30 BPF-R-M", "06:45 M-BPF", "09:00 BPF-NAM-BPF", null, null] },
  { number: 28, week: [null, "03:00 BPF-C-BPF", "05:00 BPF-NAM-BPF", null, null, "05:00 BPF-NAM-BPF", "10:00 BPF-C-BPF"] },
  { number: 29, week: ["20:45 BPF-R", "18:15 R-GL-BPF", null, null, "12:00 BPF-MKY", "12:45 MKY-BPF", "15:00 BPF-R"] },
  { number: 30, week: ["14:00 R-GL-BPF", null, "02:00 BPF-C-BPF", "02:00 BPF-C-BPF", null, null, "13:45 BPF-MKY"] },
  { number: 31, week: ["14:30 MKY-BPF", null, "12:00 BPF-MKY", "12:45 MKY-BPF", "16:30 BPF-C-BPF", "16:30 BPF-C-BPF", null] },
  { number: 32, week: [null, null, "19:15 BPF-W-M-R", "18:15 R-GL-BPF", "20:15 BPF-C-BPF", "21:00 BPF-NAM-BPF", null] },
  { number: 33, week: ["05:00 SERV", "18:00 BPF-MKY", "18:45 MKY-BPF", "23:00 BPF-MKY", "23:45 MKY-BPF", null, null] },
  { number: 34, week: [null, "01:30 BPF-R-MKY", "02:00 MKY-R-BPF", null, "03:30 BPF-W-M-R", "02:00 R-BPF", null] },
  { number: 35, week: [null, "05:00 BPF-MRY-GLD", "01:00 GLD-BPF", "05:00 BPF-MRY-GLD", "01:00 GLD-BPF", "05:45 BPF-NAM-BPF", null] },
  { number: 36, week: [null, null, "05:00 BPF-MRY-GLD", "01:00 GLD-BPF", "05:00 BPF-MRY-GLD", "01:00 GLD-BPF", null] },
];

