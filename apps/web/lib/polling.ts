const FAST_UNTIL_MS = 90_000;
const STOP_AT_MS = 5 * 60_000;

/** When to poll a running search next (null = stop) and whether to show the "slow" notice. */
export function pollPlan(elapsedMs: number): { delayMs: number | null; slow: boolean } {
  if (elapsedMs < FAST_UNTIL_MS) return { delayMs: 2000, slow: false };
  if (elapsedMs < STOP_AT_MS) return { delayMs: 5000, slow: true };
  return { delayMs: null, slow: true };
}
