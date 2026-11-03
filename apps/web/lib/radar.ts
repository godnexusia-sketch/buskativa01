import { discountPercent } from "@buskativa/core/discount";
import { type Db, type Drop, type ListedProduct, listProducts, topDrops } from "@buskativa/db";

export interface RadarItem {
  productId: number;
  store: ListedProduct["store"];
  sellerName: string | null;
  title: string;
  imageUrl: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  shippingCents: number | null;
  pagamento: ListedProduct["pagamento"];
  /** "de/por" discount in % (null without one) */
  pct: number | null;
  /** drop against the product's own recent average, in % (null when it did not drop) */
  dropPct: number | null;
  score: number;
}

/**
 * How good a deal is, from real data only: the shop's "de/por" discount plus, weighted higher, a drop against
 * the product's own price history (a discount the history confirms is worth more than a "de" price alone).
 */
export function radarScore(pct: number | null, dropPct: number | null): number {
  return (pct ?? 0) + 1.5 * (dropPct ?? 0);
}

/** Merges the biggest "de/por" discounts with the 24 h drops, scores them and keeps the best `limit`. */
export function rankRadar(deals: ListedProduct[], drops: Drop[], limit: number): RadarItem[] {
  const dropBy = new Map(drops.map((d) => [d.productId, Math.round(d.drop * 100)]));
  const items = new Map<number, RadarItem>();
  for (const p of deals) {
    const pct = discountPercent(p.priceCents / 100, p.originalPriceCents == null ? null : p.originalPriceCents / 100);
    const dropPct = dropBy.get(p.productId) ?? null;
    items.set(p.productId, {
      productId: p.productId,
      store: p.store,
      sellerName: p.sellerName,
      title: p.title,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      originalPriceCents: p.originalPriceCents,
      shippingCents: p.shippingCents,
      pagamento: p.pagamento,
      pct,
      dropPct,
      score: radarScore(pct, dropPct),
    });
  }
  for (const d of drops) {
    if (items.has(d.productId)) continue;
    const dropPct = Math.round(d.drop * 100);
    items.set(d.productId, {
      productId: d.productId,
      store: d.store,
      sellerName: null,
      title: d.title,
      imageUrl: d.imageUrl,
      priceCents: d.nowCents,
      originalPriceCents: null,
      shippingCents: null,
      pagamento: null,
      pct: null,
      dropPct,
      score: radarScore(null, dropPct),
    });
  }
  return [...items.values()].sort((a, b) => b.score - a.score || a.priceCents - b.priceCents).slice(0, limit);
}

export async function loadRadar(db: Db, now: Date, limit = 12): Promise<RadarItem[]> {
  const [deals, drops] = await Promise.all([
    listProducts(db, { order: "maior-desconto", onlyDiscount: true, limit: 60, offset: 0 }),
    topDrops(db, now, 30),
  ]);
  return rankRadar(deals.items, drops, limit);
}
