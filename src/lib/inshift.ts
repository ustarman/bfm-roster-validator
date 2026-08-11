/**
 * In-shift rest requirement (BFM solo, rules 1-4).
 *
 * The regulation fixes how much rest must sit *inside* a shift, purely as a
 * function of how long the shift is:
 *
 *   in any 6h15  ->  max 6h00 work    (15 continuous minutes rest)
 *   in any 9h00  ->  max 8h30 work    (30 minutes, in blocks of 15)
 *   in any 12h00 ->  max 11h00 work   (60 minutes, in blocks of 15)
 *   in any 24h00 ->  max 14h00 work
 *
 * So a planner who types only a start and a finish has already determined the
 * driver's work time: work = span - the minimum rest the span forces.
 *
 * We find that minimum by simulating the shift minute by minute, working
 * whenever it is legal to do so and inserting a 15-minute rest block whenever
 * it is not. Working as late as possible is optimal for these sliding-window
 * caps, so the result is the true minimum — and it reproduces the published
 * table exactly (375 -> 360 work, 540 -> 510, 720 -> 660).
 */

/** [window length, max work time within that window], both in minutes. */
export const WORK_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [375, 360], // 6h15  -> 6h00
  [540, 510], // 9h00  -> 8h30
  [720, 660], // 12h00 -> 11h00
  [1440, 840], // 24h00 -> 14h00
];

/** Rest, once required, must be taken in blocks of at least 15 continuous minutes. */
export const REST_BLOCK_MINS = 15;

export interface ShiftRest {
  /** Minimum in-shift rest the span forces, in minutes. */
  restMins: number;
  /** span - restMins. */
  workMins: number;
}

const cache = new Map<number, ShiftRest>();

export function shiftRest(spanMins: number): ShiftRest {
  const span = Math.max(0, Math.round(spanMins));
  const hit = cache.get(span);
  if (hit) return hit;

  // cum[t] = work minutes in [0, t). Time before the shift starts is rest,
  // which is why windows that reach back past minute 0 simply see less work.
  const cum = new Int32Array(span + 1);
  let resting = 0;

  for (let t = 0; t < span; t++) {
    let canWork = resting === 0;
    if (canWork) {
      const next = cum[t] + 1;
      for (const [len, cap] of WORK_WINDOWS) {
        const from = t - len + 1;
        const prior = from <= 0 ? 0 : cum[from];
        if (next - prior > cap) {
          canWork = false;
          break;
        }
      }
    }
    if (canWork) {
      cum[t + 1] = cum[t] + 1;
    } else {
      cum[t + 1] = cum[t];
      // Rest is taken in whole 15-minute blocks; if the window still has not
      // slid far enough when the block ends, the next iteration adds another.
      resting = resting === 0 ? REST_BLOCK_MINS - 1 : resting - 1;
    }
  }

  const workMins = cum[span];
  const out: ShiftRest = { restMins: span - workMins, workMins };
  cache.set(span, out);
  return out;
}
