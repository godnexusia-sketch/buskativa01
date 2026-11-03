import type { Offer } from "@buskativa/core";
import { listActiveCoupons, listProducts } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it } from "vitest";
import { couponFromLomadee, syncLomadeeCatalog, syncLomadeeCoupons } from "../src/lomadee-sync";

const now = new Date("2026-11-03T12:00:00Z");
const offer = (id: string, url = "https://www.loja.com.br/p"): Offer => ({
  store: "lomadee", externalId: `org:${id}`, title: `Air Fryer ${id}`, url, price: 300, shipping: null, currency: "BRL",
  sellerName: "Loja", attributes: { organizationId: "org", site: "loja.com.br" },
});

describe("syncLomadeeCatalog", () => {
  it("percorre as páginas até a vazia e descarta link fora do site da loja", async () => {
    const db = await createTestDb();
    const asked: number[] = [];
    const pages: Record<number, Offer[]> = { 1: [offer("a"), offer("b", "https://evil.com/p")], 2: [offer("c")], 3: [] };
    const r = await syncLomadeeCatalog(db, { page: async (n) => (asked.push(n), pages[n] ?? []) }, { pauseMs: 0, now: () => now });
    expect(asked).toEqual([1, 2, 3]);
    expect(r).toEqual({ pages: 2, products: 2, observations: 2 });
    const { items } = await listProducts(db, { order: "menor-preco", limit: 10, offset: 0 });
    expect(items.map((i) => i.title).sort()).toEqual(["Air Fryer a", "Air Fryer c"]);
  }, 90000);
});

describe("cupons da Lomadee", () => {
  const c = (over: Partial<Parameters<typeof couponFromLomadee>[0]> = {}) => ({
    code: "mais20", name: "20% OFF em peças Plus Size", brand: "Malwee", endAt: "2026-11-09T02:30:00.000Z",
    shortUrl: "https://lmdee.link/y3B2", ...over,
  });

  it("vira cupom oficial com loja no título, desconto lido do texto e link de afiliado", () => {
    expect(couponFromLomadee(c(), now)).toMatchObject({
      store: "lomadee", code: "MAIS20", title: "Malwee: 20% OFF em peças Plus Size", discountType: "percent",
      discountValue: 20, sourceUrl: "https://lmdee.link/y3B2", source: "oficial",
    });
  });

  it("sem valor no texto ou vencido não entra", () => {
    expect(couponFromLomadee(c({ name: "Cupom exclusivo Black Friday" }), now)).toBeNull();
    expect(couponFromLomadee(c({ endAt: "2026-11-01T00:00:00Z" }), now)).toBeNull();
  });

  it("salva os válidos e, com o mesmo código, fica o que dura mais", async () => {
    const db = await createTestDb();
    const r = await syncLomadeeCoupons(
      db,
      {
        coupons: async () => [
          c({ code: "BF30", name: "Cupom de R$ 30,00 de desconto", brand: "A", endAt: "2026-11-20T00:00:00Z" }),
          c({ code: "BF30", name: "Cupom de R$ 30,00 de desconto", brand: "B", endAt: "2026-12-20T00:00:00Z" }),
          c({ code: "SEMVALOR", name: "Oferta especial" }),
        ],
      },
      now,
    );
    expect(r).toEqual({ saved: 1, skipped: 1, removed: 0 });
    const list = await listActiveCoupons(db, "lomadee", now);
    expect(list.map((x) => [x.code, x.title])).toEqual([["BF30", "B: Cupom de R$ 30,00 de desconto"]]);
  }, 90000);
});

describe("syncLomadeeCatalog com falhas", () => {
  it("pula a página que falha e segue", async () => {
    const db = await createTestDb();
    const pages: Record<number, Offer[]> = { 1: [offer("a")], 3: [offer("c")], 4: [] };
    const r = await syncLomadeeCatalog(
      db,
      { page: async (n) => { if (n === 2) throw new Error("terminated"); return pages[n] ?? []; } },
      { pauseMs: 0, now: () => now },
    );
    expect(r.products).toBe(2);
  }, 90000);
});

describe("cupons que saíram da rede", () => {
  it("são desativados; resposta muito menor que o normal não desativa nada", async () => {
    const db = await createTestDb();
    const cup = (code: string) => ({ code, name: "10% OFF", brand: "L", endAt: "2026-12-30T00:00:00Z", shortUrl: "https://lmdee.link/x" });
    await syncLomadeeCoupons(db, { coupons: async () => ["AAA", "BBB", "CCC", "DDD"].map(cup) }, now);
    expect((await syncLomadeeCoupons(db, { coupons: async () => [cup("AAA")] }, now)).removed).toBe(0);
    const r = await syncLomadeeCoupons(db, { coupons: async () => ["AAA", "BBB", "CCC"].map(cup) }, now);
    expect(r.removed).toBe(1);
    expect((await listActiveCoupons(db, "lomadee", now)).map((c) => c.code).sort()).toEqual(["AAA", "BBB", "CCC"]);
  }, 90000);
});
