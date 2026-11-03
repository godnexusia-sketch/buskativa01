import { normalizeQuery } from "@buskativa/core";
import { type Db, listWatchedQueries, queriesWithRecentChange } from "@buskativa/db";

export function pickStartupQueries(watched: string[], trending: string[], n = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of [...watched, ...trending]) {
    const hash = normalizeQuery(text).hash;
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push(text);
    if (out.length === n) break;
  }
  return out;
}

export function isDue(lastRunAt: Date | null, recentlyChanged: boolean, now: Date, baseMin = 60, fastMin = 30): boolean {
  if (!lastRunAt) return true;
  const interval = (recentlyChanged ? fastMin : baseMin) * 60e3;
  return now.getTime() - lastRunAt.getTime() >= interval;
}

export async function dueQueries(db: Db, now: Date, cfg: { baseMin?: number; fastMin?: number } = {}): Promise<string[]> {
  const watched = await listWatchedQueries(db, 500);
  const changed = await queriesWithRecentChange(db, now);
  return watched
    .filter((q) => isDue(q.lastRunAt, changed.has(q.id), now, cfg.baseMin, cfg.fastMin))
    .map((q) => q.original);
}
