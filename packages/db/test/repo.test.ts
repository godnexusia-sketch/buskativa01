import { normalizeQuery, type Offer } from "@buskativa/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import {
  createRun, finishRun, getPriceHistory, getRecentRunForHash, getRunWithResults,
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
