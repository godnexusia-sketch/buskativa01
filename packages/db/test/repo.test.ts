import { normalizeQuery, type CouponValue, type Offer } from "@buskativa/core";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import {
  backfillCategories, categoryCounts, createRun, importOffers, syncCatalogOffers, deactivateCoupon, finishRun, listActiveCoupons, upsertCoupon, voteCoupon, getLatestOriginalPriceCents, getPriceHistory, getRecentRunForHash, getRunWithResults,
  latestRunIdForProduct, listProducts, purgeExpiredData, queriesWithRecentChange, saveOffers, topDrops, updateRunStoreStatus,
  upsertQuery,
} from "../src/repo";
import { clicks, couponVotes, coupons } from "../src/schema";
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

describe("retenção (purgeExpiredData)", { timeout: 90000 }, () => {
  const base: CouponValue = {
    store: "amazon", code: "RET10", title: "10%", description: null, discountType: "percent",
    discountValue: 10, minOrderCents: null, validUntil: null, sourceUrl: null, source: "manual", active: true,
  };
  const now = new Date("2026-11-03T12:00:00Z");
  const DAY = 24 * 60 * MIN;
  const voteIds = async () => (await db.select().from(couponVotes)).map((v) => v.couponId).sort((a, b) => a - b);

  it("deactivateCoupon marca deactivated_at e a reativação pelo upsert limpa", async () => {
    const c = await upsertCoupon(db, base);
    expect(c.deactivatedAt).toBeNull();
    const at = new Date("2026-10-01T00:00:00Z");
    await deactivateCoupon(db, c.id, at);
    // desativar de novo não reinicia a contagem
    await deactivateCoupon(db, c.id, new Date("2026-10-20T00:00:00Z"));
    const [off] = await db.select().from(coupons).where(sql`id = ${c.id}`);
    expect(off.deactivatedAt?.toISOString()).toBe(at.toISOString());
    const back = await upsertCoupon(db, base);
    expect(back).toMatchObject({ active: true, deactivatedAt: null });
    const inactive = await upsertCoupon(db, { ...base, code: "OFF2", active: false });
    expect(inactive.deactivatedAt).toBeInstanceOf(Date);
  });

  it("apaga cliques com mais de 12 meses e mantém os mais novos", async () => {
    const q = await upsertQuery(db, nq);
    const [productId] = await saveOffers(db, await createRun(db, q.id), [offer()]);
    await db.insert(clicks).values([
      { productId, at: new Date("2025-11-03T11:59:59Z") }, // 12 meses e 1 s
      { productId, at: new Date("2025-11-03T12:00:00Z") }, // exatamente 12 meses: fica
      { productId, at: new Date("2026-11-01T00:00:00Z") },
    ]);
    const res = await purgeExpiredData(db, now);
    expect(res.clicks).toBe(1);
    expect((await db.select().from(clicks)).map((c) => c.at.toISOString()).sort()).toEqual([
      "2025-11-03T12:00:00.000Z", "2026-11-01T00:00:00.000Z",
    ]);
  });

  it("apaga votos de cupons inativos há mais de 30 dias ou vencidos há mais de 30 dias", async () => {
    const mk = async (code: string, over: Partial<CouponValue> = {}) => {
      const c = await upsertCoupon(db, { ...base, code, ...over });
      await voteCoupon(db, c.id, "h1", true, new Date(0));
      return c.id;
    };
    const ativo = await mk("ATIVO1");
    const offVelho = await mk("OFFVELHO");
    const offLimite = await mk("OFFLIMITE");
    const offNovo = await mk("OFFNOVO");
    const vencVelho = await mk("VENCVELHO", { validUntil: new Date(now.getTime() - 30 * DAY - 1000) });
    const vencLimite = await mk("VENCLIMITE", { validUntil: new Date(now.getTime() - 30 * DAY) });
    await deactivateCoupon(db, offVelho, new Date(now.getTime() - 30 * DAY - 1000));
    await deactivateCoupon(db, offLimite, new Date(now.getTime() - 30 * DAY));
    await deactivateCoupon(db, offNovo, new Date(now.getTime() - 29 * DAY));

    const res = await purgeExpiredData(db, now);
    expect(res.couponVotes).toBe(2);
    expect(await voteIds()).toEqual([ativo, offLimite, offNovo, vencLimite].sort((a, b) => a - b));
    expect(vencVelho).toBeGreaterThan(0);
    // idempotente
    expect(await purgeExpiredData(db, now)).toEqual({ clicks: 0, couponVotes: 0 });
  });
});

describe("listProducts", { timeout: 90000 }, () => {
  const seed = async () => {
    const q = await upsertQuery(db, nq);
    const t0 = new Date("2026-03-01T10:00:00Z");
    const t1 = new Date("2026-03-02T10:00:00Z");
    const r = await createRun(db, q.id, t0);
    // A: preço caiu (último = 80, original 100 -> 20%)
    await saveOffers(db, r, [offer({ externalId: "A", title: "A", price: 120 })], t0);
    await saveOffers(db, r, [offer({ externalId: "A", title: "A", price: 80, originalPrice: 100 })], t1);
    await saveOffers(db, r, [offer({ externalId: "B", title: "B", price: 50, originalPrice: 200, attributes: { pagamento: "pix" } })], t0);
    await saveOffers(db, r, [offer({ externalId: "C", title: "C", price: 300 })], new Date("2026-03-03T10:00:00Z"));
    await saveOffers(db, r, [offer({ store: "amazon", externalId: "D", title: "D", price: 60, url: "https://www.amazon.com.br/dp/D" })], t0);
  };
  const titles = (r: { items: { title: string }[] }) => r.items.map((i) => i.title);
  const base = { order: "menor-preco" as const, limit: 24, offset: 0 };

  it("usa só o último preço de cada produto e ordena por menor preço", async () => {
    await seed();
    const r = await listProducts(db, base);
    expect(titles(r)).toEqual(["B", "D", "A", "C"]);
    expect(r.total).toBe(4);
    const a = r.items.find((i) => i.title === "A")!;
    expect(a).toMatchObject({ priceCents: 8000, originalPriceCents: 10000, store: "mercadolivre", pagamento: null });
    expect(r.items[0].pagamento).toBe("pix");
  });

  it("filtra por loja e faixa de preço (inclusive)", async () => {
    await seed();
    expect(titles(await listProducts(db, { ...base, store: "amazon" }))).toEqual(["D"]);
    expect(titles(await listProducts(db, { ...base, minCents: 6000, maxCents: 8000 }))).toEqual(["D", "A"]);
    const r = await listProducts(db, { ...base, minCents: 100000 });
    expect(r).toEqual({ items: [], total: 0 });
  });

  it("maior-desconto usa (original - preço)/original do último registro; sem desconto por último", async () => {
    await seed();
    expect(titles(await listProducts(db, { ...base, order: "maior-desconto" }))).toEqual(["B", "A", "D", "C"]);
  });

  it("recentes ordena pela observação mais recente", async () => {
    await seed();
    expect(titles(await listProducts(db, { ...base, order: "recentes" }))).toEqual(["C", "A", "D", "B"]);
  });

  it("pagina com limit/offset e total constante", async () => {
    await seed();
    const p1 = await listProducts(db, { ...base, limit: 3, offset: 0 });
    const p2 = await listProducts(db, { ...base, limit: 3, offset: 3 });
    expect(titles(p1)).toEqual(["B", "D", "A"]);
    expect(titles(p2)).toEqual(["C"]);
    expect(p1.total).toBe(4);
    expect(p2.total).toBe(4);
    expect(await listProducts(db, { ...base, offset: 50 })).toEqual({ items: [], total: 0 });
  });

  it("preço e ordem consideram o frete quando informado", async () => {
    const q = await upsertQuery(db, nq);
    const r = await createRun(db, q.id);
    await saveOffers(db, r, [
      offer({ externalId: "X", title: "X", price: 50, shipping: 40 }),
      offer({ externalId: "Y", title: "Y", price: 80, shipping: 0 }),
      offer({ externalId: "Z", title: "Z", price: 85, shipping: null }),
    ]);
    expect(titles(await listProducts(db, base))).toEqual(["Y", "Z", "X"]);
    expect(titles(await listProducts(db, { ...base, maxCents: 8500 }))).toEqual(["Y", "Z"]);
    expect(titles(await listProducts(db, { ...base, minCents: 9000 }))).toEqual(["X"]);
  });

  it("empata observações com o mesmo observed_at pelo maior id", async () => {
    const q = await upsertQuery(db, nq);
    const r = await createRun(db, q.id);
    const at = new Date("2026-03-01T10:00:00Z");
    await saveOffers(db, r, [offer({ externalId: "T", title: "T", price: 100 })], at);
    await saveOffers(db, r, [offer({ externalId: "T", title: "T", price: 70 })], at);
    const res = await listProducts(db, base);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].priceCents).toBe(7000);
  });

  it("banco vazio devolve lista vazia", async () => {
    expect(await listProducts(db, base)).toEqual({ items: [], total: 0 });
  });

  it("filtra por categoria (deduzida do título) e por só com desconto", async () => {
    const q = await upsertQuery(db, nq);
    const r = await createRun(db, q.id);
    await saveOffers(db, r, [
      offer({ externalId: "T", title: "Smart TV 50 Polegadas", price: 2000, originalPrice: 2500 }),
      offer({ externalId: "F", title: "Fone JBL Tune", price: 200 }),
      offer({ externalId: "G", title: "Fone Sony WH", price: 300, originalPrice: 400 }),
    ]);
    expect(titles(await listProducts(db, { ...base, category: "audio" }))).toEqual(["Fone JBL Tune", "Fone Sony WH"]);
    expect(titles(await listProducts(db, { ...base, category: "audio", onlyDiscount: true }))).toEqual(["Fone Sony WH"]);
    expect(await categoryCounts(db)).toEqual({ audio: 2, tvs: 1 });
  });

  it("importOffers grava como execução concluída de uma busca que o agendador não repete", async () => {
    const ids = await importOffers(db, "ml mais vendidos", [offer({ externalId: "MLB9", title: "Air Fryer Mondial", price: 299 })]);
    await importOffers(db, "ml mais vendidos", [offer({ externalId: "MLB9", title: "Air Fryer Mondial", price: 279 })]);
    expect((await getPriceHistory(db, ids[0])).map((p) => p.price)).toEqual([299, 279]);
    const q = await db.execute(sql`select watched, last_run_at from queries`);
    expect((q as unknown as { rows: { watched: boolean; last_run_at: unknown }[] }).rows).toEqual([
      { watched: false, last_run_at: expect.anything() },
    ]);
    expect(await categoryCounts(db)).toEqual({ cozinha: 1 });
  });

  it("syncCatalogOffers grava em lote e só registra preço novo quando muda ou fica velho", async () => {
    const t0 = new Date("2026-11-01T10:00:00Z");
    const o = (id: string, price: number) => offer({ store: "lomadee", externalId: id, title: `Air Fryer ${id}`, price, url: "https://loja.com.br/p", attributes: { site: "loja.com.br" } });
    expect(await syncCatalogOffers(db, [o("a", 100), o("b", 200), o("a", 100)], t0)).toEqual({ products: 2, observations: 2 });
    expect(await syncCatalogOffers(db, [o("a", 100), o("b", 180)], new Date(t0.getTime() + 3600e3))).toEqual({ products: 2, observations: 1 });
    expect(await syncCatalogOffers(db, [o("a", 100)], new Date(t0.getTime() + 25 * 3600e3))).toEqual({ products: 1, observations: 1 });
    expect(await syncCatalogOffers(db, [])).toEqual({ products: 0, observations: 0 });
    const r = await listProducts(db, base);
    expect(r.items.map((i) => [i.title, i.priceCents])).toEqual([["Air Fryer a", 10000], ["Air Fryer b", 18000]]);
    expect(await categoryCounts(db)).toEqual({ cozinha: 2 });
  });

  it("backfillCategories preenche só quem está sem categoria", async () => {
    const q = await upsertQuery(db, nq);
    await saveOffers(db, await createRun(db, q.id), [offer({ externalId: "N", title: "Notebook Dell" })]);
    await db.execute(sql`update products set category = null`);
    expect(await backfillCategories(db, 1)).toBe(1);
    expect(await categoryCounts(db)).toEqual({ notebooks: 1 });
    expect(await backfillCategories(db)).toBe(0);
  });
});
