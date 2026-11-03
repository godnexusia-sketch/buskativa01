import { normalizeQuery, type CouponValue, type Offer } from "@buskativa/core";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import {
  createRun, deactivateCoupon, finishRun, listActiveCoupons, upsertCoupon, voteCoupon, getLatestOriginalPriceCents, getPriceHistory, getRecentRunForHash, getRunWithResults,
  latestRunIdForProduct, queriesWithRecentChange, saveOffers, topDrops, updateRunStoreStatus,
  upsertQuery,
} from "../src/repo";
import { createTestDb } from "../src/testing";

const MIN = 60e3;
const nq = normalizeQuery("fone bluetooth");
const offer = (over: Partial<Offer> = {}): Offer => ({
  store: "mercadolivre",
  externalId: "MLB1",
  title: "Fone Bluetooth X",
  url: "https://www.mercadolivre.com.br/p/MLB1",
  price: 100,
  shipping: 0,
  currency: "BRL",
  attributes: {},
  ...over,
});

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("repo", () => {
  it("upsertQuery é idempotente pelo hash", async () => {
    const a = await upsertQuery(db, nq);
    const b = await upsertQuery(db, normalizeQuery("Bluetooth Fone"));
    expect(b.id).toBe(a.id);
  });

  it("saveOffers reaproveita o produto e acumula observações", async () => {
    const q = await upsertQuery(db, nq);
    const r1 = await createRun(db, q.id);
    const [p1] = await saveOffers(db, r1, [offer({ price: 100 })]);
    const r2 = await createRun(db, q.id);
    const [p2] = await saveOffers(db, r2, [offer({ price: 90, shipping: null }), offer({ externalId: "MLB2", price: 50 })]);
    expect(p2).toBe(p1);
    expect((await getPriceHistory(db, p1)).map((p) => p.price)).toEqual([100, 90]);
    const run = await getRunWithResults(db, r2);
    expect(run!.results.map((r) => r.priceCents)).toEqual([5000, 9000]);
    expect(run!.query.termo).toBe("fone bluetooth");
    expect(await latestRunIdForProduct(db, p1)).toBe(r2);
  });

  it("saveOffers grava o preço original e getRunWithResults devolve com a forma de pagamento", { timeout: 90000 }, async () => {
    const q = await upsertQuery(db, nq);
    const r = await createRun(db, q.id);
    const [com, sem] = await saveOffers(db, r, [
      offer({ price: 75, originalPrice: 100, attributes: { pagamento: "app" } }),
      offer({ externalId: "MLB2", price: 120 }),
    ]);
    const run = await getRunWithResults(db, r);
    expect(run!.results.map((x) => [x.productId, x.priceCents, x.originalPriceCents, x.pagamento])).toEqual([
      [com, 7500, 10000, "app"],
      [sem, 12000, null, null],
    ]);
    expect(await getLatestOriginalPriceCents(db, com)).toBe(10000);
    expect(await getLatestOriginalPriceCents(db, sem)).toBeNull();
  });

  it("updateRunStoreStatus mescla lojas e finishRun conclui", async () => {
    const q = await upsertQuery(db, nq);
    const r = await createRun(db, q.id);
    await updateRunStoreStatus(db, r, "mercadolivre", { ok: true, count: 2 });
    await updateRunStoreStatus(db, r, "shopee", { ok: false, error: "BLOCKED" });
    await finishRun(db, r);
    const run = await getRunWithResults(db, r);
    expect(run!.status).toBe("done");
    expect(run!.storeStatus).toEqual({
      mercadolivre: { ok: true, count: 2 },
      shopee: { ok: false, error: "BLOCKED" },
    });
  });

  it("getRecentRunForHash respeita 15 min (concluída) e 2 min (em andamento)", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const q = await upsertQuery(db, nq);
    const velha = await createRun(db, q.id, new Date(now.getTime() - 25 * MIN));
    await finishRun(db, velha, new Date(now.getTime() - 20 * MIN));
    expect(await getRecentRunForHash(db, nq.hash, now)).toBeNull();

    const travada = await createRun(db, q.id, new Date(now.getTime() - 5 * MIN));
    expect(travada).toBeGreaterThan(velha);
    expect(await getRecentRunForHash(db, nq.hash, now)).toBeNull();

    const recente = await createRun(db, q.id, new Date(now.getTime() - 1 * MIN));
    expect(await getRecentRunForHash(db, nq.hash, now)).toBe(recente);
  });

  it("queriesWithRecentChange e topDrops detectam queda de preço", async () => {
    const now = new Date();
    const q = await upsertQuery(db, nq);
    const r1 = await createRun(db, q.id, new Date(now.getTime() - 5 * 24 * 60 * MIN));
    await saveOffers(db, r1, [offer({ price: 100 })], new Date(now.getTime() - 5 * 24 * 60 * MIN));
    const r2 = await createRun(db, q.id, new Date(now.getTime() - 2 * 60 * MIN));
    await saveOffers(db, r2, [offer({ price: 80 })], new Date(now.getTime() - 2 * 60 * MIN));

    const r3 = await createRun(db, q.id, new Date(now.getTime() - 60 * MIN));
    await saveOffers(db, r3, [offer({ price: 80 })]);

    expect((await queriesWithRecentChange(db, now)).has(q.id)).toBe(false);
    const r4 = await createRun(db, q.id, new Date(now.getTime() - 30 * MIN));
    await saveOffers(db, r4, [offer({ price: 75 })]);
    expect((await queriesWithRecentChange(db, now)).has(q.id)).toBe(true);

    const drops = await topDrops(db, now, 10);
    expect(drops).toHaveLength(1);
    expect(drops[0].nowCents).toBe(7500);
    expect(drops[0].prevAvgCents).toBe(10000);
    expect(drops[0].drop).toBeCloseTo(0.25);
  });
});

describe("migrações", () => {
  it("indexa price_observations por observed_at (usado por topDrops)", async () => {
    const res = await db.execute(
      sql`select indexdef from pg_indexes where tablename = 'price_observations' and indexname = 'price_obs_time'`,
    );
    const rows = (res as unknown as { rows: { indexdef: string }[] }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/\(observed_at\)/);
  }, 90000);
});

describe("cupons", { timeout: 90000 }, () => {
  const base: CouponValue = {
    store: "amazon", code: "ECONOMIZA10", title: "10% na Amazon", description: null, discountType: "percent",
    discountValue: 10, minOrderCents: null, validUntil: null, sourceUrl: null, source: "manual", active: true,
  };
  const now = new Date("2026-11-03T12:00:00Z");

  it("começa sem nenhum cupom", async () => {
    expect(await listActiveCoupons(db, undefined, now)).toEqual([]);
  });

  it("upsertCoupon cria e atualiza por (loja, código) sem zerar os votos", async () => {
    const a = await upsertCoupon(db, base);
    await voteCoupon(db, a.id, "h1", true);
    const b = await upsertCoupon(db, { ...base, title: "Novo título", discountValue: 15 });
    expect(b.id).toBe(a.id);
    expect(b).toMatchObject({ title: "Novo título", discountValue: 15, worked: 1, failed: 0 });
    expect(await listActiveCoupons(db, undefined, now)).toHaveLength(1);
  });

  it("listActiveCoupons filtra por loja, esconde vencidos e inativos e ordena por confiança", async () => {
    const low = await upsertCoupon(db, { ...base, code: "BAIXA1" });
    const high = await upsertCoupon(db, { ...base, code: "ALTA1" });
    for (const h of ["a", "b", "c"]) await voteCoupon(db, high.id, h, true);
    await upsertCoupon(db, { ...base, code: "OFICIAL1", source: "oficial" });
    await upsertCoupon(db, { ...base, code: "VENCIDO1", validUntil: new Date("2026-11-01T00:00:00Z") });
    const off = await upsertCoupon(db, { ...base, code: "OFF1" });
    await deactivateCoupon(db, off.id);
    await upsertCoupon(db, { ...base, store: "magalu", code: "MAGA10" });

    const amazon = await listActiveCoupons(db, "amazon", now);
    expect(amazon.map((c) => c.code)).toEqual(["ALTA1", "OFICIAL1", "BAIXA1"]);
    expect(amazon.map((c) => c.confidence)).toEqual(["alta", "media", "baixa"]);
    expect(low.id).toBeGreaterThan(0);
    expect(await listActiveCoupons(db, undefined, now)).toHaveLength(4);
  });

  it("voteCoupon: um voto por pessoa; mesmo voto repetido não soma; trocar de voto move o contador", async () => {
    const c = await upsertCoupon(db, base);
    expect(await voteCoupon(db, c.id, "h1", true)).toMatchObject({ worked: 1, failed: 0 });
    expect(await voteCoupon(db, c.id, "h1", true)).toMatchObject({ worked: 1, failed: 0 });
    expect(await voteCoupon(db, c.id, "h2", false)).toMatchObject({ worked: 1, failed: 1 });
    expect(await voteCoupon(db, c.id, "h1", false)).toMatchObject({ worked: 0, failed: 2 });
    expect(await voteCoupon(db, c.id, "h1", true)).toMatchObject({ worked: 1, failed: 1 });
  });

  it("voteCoupon retorna null para cupom inexistente ou desativado", async () => {
    expect(await voteCoupon(db, 999, "h1", true)).toBeNull();
    const c = await upsertCoupon(db, base);
    await deactivateCoupon(db, c.id);
    expect(await voteCoupon(db, c.id, "h1", true)).toBeNull();
  });

  it("voteCoupon recusa cupom vencido", async () => {
    const c = await upsertCoupon(db, { ...base, validUntil: new Date("2026-11-04T00:00:00Z") });
    expect(await voteCoupon(db, c.id, "h1", true, now)).toMatchObject({ worked: 1 });
    expect(await voteCoupon(db, c.id, "h2", true, new Date("2026-11-05T00:00:00Z"))).toBe("expired");
  });

  it("upsertCoupon informa se criou ou atualizou", async () => {
    expect((await upsertCoupon(db, base)).created).toBe(true);
    expect((await upsertCoupon(db, { ...base, title: "x" })).created).toBe(false);
  });

  it("listActiveCoupons respeita o limite", async () => {
    for (const code of ["AAA1", "AAA2", "AAA3"]) await upsertCoupon(db, { ...base, code });
    expect(await listActiveCoupons(db, undefined, now, 2)).toHaveLength(2);
    // the limit keeps the best-voted coupon even when it is the oldest
    const first = await upsertCoupon(db, { ...base, code: "MELHOR1" });
    await db.execute(sql`update coupons set created_at = created_at - interval '1 day' where id = ${first.id}`);
    for (const h of ["a", "b", "c"]) await voteCoupon(db, first.id, h, true);
    expect((await listActiveCoupons(db, undefined, now, 1)).map((c) => c.code)).toEqual(["MELHOR1"]);
  });

  it("deactivateCoupon informa se o cupom existia", async () => {
    const c = await upsertCoupon(db, base);
    expect(await deactivateCoupon(db, c.id)).toBe(true);
    expect(await deactivateCoupon(db, 999)).toBe(false);
    expect(await listActiveCoupons(db, undefined, now)).toEqual([]);
  });
});
