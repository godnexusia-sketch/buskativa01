import type { Drop, ListedProduct } from "@buskativa/db";
import { describe, expect, it } from "vitest";
import { radarScore, rankRadar } from "../lib/radar";

const deal = (productId: number, priceCents: number, originalPriceCents: number | null): ListedProduct => ({
  productId, store: "amazon", title: `P${productId}`, imageUrl: null, sellerName: null, priceCents, originalPriceCents,
  shippingCents: null, pagamento: null, observedAt: new Date(),
});
const drop = (productId: number, d: number): Drop => ({ productId, store: "amazon", title: `D${productId}`, imageUrl: null, nowCents: 1000, prevAvgCents: 2000, drop: d });

describe("radar", () => {
  it("queda confirmada pelo histórico pesa mais que o desconto de/por", () => {
    expect(radarScore(20, null)).toBe(20);
    expect(radarScore(10, 10)).toBe(25);
    expect(radarScore(null, null)).toBe(0);
  });

  it("junta descontos e quedas, sem repetir, e ordena pela pontuação", () => {
    const r = rankRadar([deal(1, 5000, 10000), deal(2, 9000, 10000)], [drop(2, 0.4), drop(3, 0.2)], 10);
    expect(r.map((i) => [i.productId, i.score])).toEqual([[2, 70], [1, 50], [3, 30]]);
    expect(r[0]).toMatchObject({ pct: 10, dropPct: 40 });
    expect(rankRadar([deal(1, 5000, 10000), deal(2, 9000, 10000)], [], 1).map((i) => i.productId)).toEqual([1]);
  });
});
