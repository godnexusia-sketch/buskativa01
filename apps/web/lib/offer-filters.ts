/** Client-safe helpers (no core barrel import): filter/sort for /busca and money parsing shared with /ofertas. */

export const MAX_CENTS = 2147483647; // postgres integer

export type OfferOrder = "relevancia" | "menor-preco" | "maior-desconto";

export interface OfferLike {
  productId: number;
  store: string;
  priceCents: number;
  totalCents: number;
  originalPriceCents: number | null;
  groupId: number;
}

export interface OfferView {
  store: string | null;
  minCents: number | undefined;
  maxCents: number | undefined;
  order: OfferOrder;
}

/** "10", "10,5", "1299.90", "1.299,90" (reais) -> cents; undefined for empty/invalid/negative. */
export function parseReais(raw: string | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  let s = raw.trim();
  if (!s) return undefined;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.round(n * 100), MAX_CENTS);
}

/** Cents -> plain reais string ("10", "99.9"), clamped to the same range parseReais accepts. */
export function formatReais(cents: number | undefined): string {
  return cents === undefined ? "" : String(Math.min(Math.max(cents, 0), MAX_CENTS) / 100);
}

const discountRatio = (o: OfferLike) =>
  o.originalPriceCents !== null && o.originalPriceCents > o.priceCents ? (o.originalPriceCents - o.priceCents) / o.originalPriceCents : 0;

/**
 * Filters by store and total price range, sorts, then groups by `groupId`; the first item of each group is the
 * best one under the chosen order and groups follow the order of their first item. `stores` counts distinct
 * stores among the shown offers.
 */
export function applyOfferView<T extends OfferLike>(items: T[], v: OfferView): { groups: T[][]; offers: number; stores: number } {
  let { minCents, maxCents } = v;
  if (minCents !== undefined && maxCents !== undefined && minCents > maxCents) [minCents, maxCents] = [maxCents, minCents];
  let list = items.filter(
    (o) =>
      (v.store === null || o.store === v.store) &&
      (minCents === undefined || o.totalCents >= minCents) &&
      (maxCents === undefined || o.totalCents <= maxCents),
  );
  if (v.order === "menor-preco") list = [...list].sort((a, b) => a.totalCents - b.totalCents);
  else if (v.order === "maior-desconto") list = [...list].sort((a, b) => discountRatio(b) - discountRatio(a) || a.totalCents - b.totalCents);
  const byGroup = new Map<number, T[]>();
  for (const o of list) byGroup.set(o.groupId, [...(byGroup.get(o.groupId) ?? []), o]);
  return { groups: [...byGroup.values()], offers: list.length, stores: new Set(list.map((o) => o.store)).size };
}
