/** Sliding-window limiter per key. Keys whose window emptied are swept at most once per window. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  let lastSweep = -Infinity;

  function sweep(now: number) {
    // timestamps are appended in order, so the last one is the newest
    for (const [key, ts] of hits) if (now - ts[ts.length - 1] >= windowMs) hits.delete(key);
    lastSweep = now;
  }

  const allow = (key: string, now = Date.now()): boolean => {
    if (now - lastSweep >= windowMs) sweep(now);
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    const allowed = recent.length < limit;
    if (allowed) recent.push(now);
    if (recent.length > 0) hits.set(key, recent);
    else hits.delete(key);
    return allowed;
  };
  return Object.assign(allow, { size: () => hits.size });
}
