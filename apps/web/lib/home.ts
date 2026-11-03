import type { CategoryId } from "@buskativa/core/categories";
import { categoryCounts, listProducts, topDrops, type Drop, type ListedProduct } from "@buskativa/db";
import { getDb } from "./server";

/** Maiores quedas para a home; sem banco devolve [] (estado vazio) em vez de derrubar a página com 500. */
export async function loadTopDrops(now: Date, limit: number): Promise<Drop[]> {
  try {
    return await topDrops(getDb(), now, limit);
  } catch (err) {
    console.error("falha ao carregar as maiores quedas", err);
    return [];
  }
}

export interface HomeSections {
  deals: ListedProduct[];
  counts: Partial<Record<CategoryId, number>>;
  total: number;
  rails: { category: CategoryId; items: ListedProduct[] }[];
}

const EMPTY: HomeSections = { deals: [], counts: {}, total: 0, rails: [] };

/** Biggest discounts right now plus one shelf per busiest category; without a database returns empty sections. */
export async function loadHomeSections(rails = 4, perRail = 10): Promise<HomeSections> {
  try {
    const db = getDb();
    const [deals, counts] = await Promise.all([
      listProducts(db, { order: "maior-desconto", onlyDiscount: true, limit: 12, offset: 0 }),
      categoryCounts(db),
    ]);
    const busiest = (Object.entries(counts) as [CategoryId, number][])
      .filter(([id]) => id !== "outros")
      .sort((a, b) => b[1] - a[1])
      .slice(0, rails)
      .map(([id]) => id);
    const shelves = await Promise.all(
      busiest.map(async (category) => ({
        category,
        items: (await listProducts(db, { category, order: "maior-desconto", limit: perRail, offset: 0 })).items,
      })),
    );
    const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
    return { deals: deals.items, counts, total, rails: shelves.filter((s) => s.items.length > 0) };
  } catch (err) {
    console.error("falha ao carregar a home", err);
    return EMPTY;
  }
}
