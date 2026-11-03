import { matchesAttributes } from "./query";
import { isAllowedOffer } from "./stores";
import { tokens } from "./text";
import type { NormalizedQuery, Offer } from "./types";

export const totalPrice = (o: Offer): number => o.price + (o.shipping ?? 0);

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function isSuspiciousPrice(price: number, med: number): boolean {
  return !(price > 0) || (med > 0 && price < med * 0.1);
}

export function filterOffers(
  offers: Offer[],
  q: NormalizedQuery,
  opts: { minSellerRating?: number } = {},
): Offer[] {
  const minRating = opts.minSellerRating ?? 4;
  const base = offers.filter(
    (o) =>
      isAllowedOffer(o) &&
      (o.sellerRating === undefined || o.sellerRating >= minRating) &&
      (q.tipo === "generica" || matchesAttributes(o.title, q.atributos)),
  );
  const med = median(base.map((o) => o.price).filter((p) => p > 0));
  return base.filter((o) => !isSuspiciousPrice(o.price, med));
}

export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function groupSimilar<T extends { title: string }>(items: T[], threshold = 0.6): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const g = groups.find((grp) => similarity(grp[0].title, item.title) >= threshold);
    if (g) g.push(item);
    else groups.push([item]);
  }
  return groups;
}
