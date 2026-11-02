import { median } from "./offers";
import type { PricePoint } from "./types";

/** America/Sao_Paulo: UTC−3 fixo (sem horário de verão desde 2019). */
const TZ_OFFSET_MS = 3 * 3600e3;
const DAY = 86400e3;
const BLOCK_MS = 3 * 3600e3;

export type Confidence = "baixa" | "media" | "alta";

export interface PriceStats {
  lowest: { price: number; observedAt: Date };
  current: number;
  avg30d: number;
  changeVsAvg30d: number;
  bestWeekday: number;
  bestHourBlock: number;
  confidence: Confidence;
  nextLowWindow: Date;
}

const toLocal = (d: Date) => new Date(d.getTime() - TZ_OFFSET_MS);

function bestGroup(points: PricePoint[], key: (local: Date) => number, size: number): number {
  const groups: number[][] = Array.from({ length: size }, () => []);
  for (const p of points) groups[key(toLocal(p.observedAt))].push(p.price);
  let best = 0;
  let bestMed = Infinity;
  groups.forEach((g, i) => {
    if (g.length === 0) return;
    const m = median(g);
    if (m < bestMed) {
      bestMed = m;
      best = i;
    }
  });
  return best;
}

export function nextWindow(now: Date, weekday: number, block: number): Date {
  const ln = toLocal(now);
  const startOfDay = Date.UTC(ln.getUTCFullYear(), ln.getUTCMonth(), ln.getUTCDate());
  const diff = (weekday - ln.getUTCDay() + 7) % 7;
  let cand = startOfDay + diff * DAY + block * BLOCK_MS;
  if (cand <= ln.getTime()) cand += 7 * DAY;
  return new Date(cand + TZ_OFFSET_MS);
}

export function computeStats(input: PricePoint[], now: Date): PriceStats | null {
  if (input.length === 0) return null;
  const points = [...input].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  let lowest = points[0];
  for (const p of points) if (p.price < lowest.price) lowest = p;
  const current = points[points.length - 1].price;

  const recent = points.filter((p) => p.observedAt.getTime() >= now.getTime() - 30 * DAY);
  const ref = recent.length > 0 ? recent : points;
  const avg30d = ref.reduce((s, p) => s + p.price, 0) / ref.length;

  const bestWeekday = bestGroup(points, (d) => d.getUTCDay(), 7);
  const bestHourBlock = bestGroup(points, (d) => Math.floor(d.getUTCHours() / 3), 8);

  const spanDays =
    (points[points.length - 1].observedAt.getTime() - points[0].observedAt.getTime()) / DAY;
  const confidence: Confidence =
    spanDays < 14 || points.length < 30 ? "baixa" : spanDays < 60 ? "media" : "alta";

  return {
    lowest: { price: lowest.price, observedAt: lowest.observedAt },
    current,
    avg30d,
    changeVsAvg30d: (current - avg30d) / avg30d,
    bestWeekday,
    bestHourBlock,
    confidence,
    nextLowWindow: nextWindow(now, bestWeekday, bestHourBlock),
  };
}
