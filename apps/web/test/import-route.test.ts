import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imported: { label: string; offers: unknown[] }[] = [];
vi.mock("../lib/server", () => ({ getDb: () => ({}) }));
vi.mock("@buskativa/db", () => ({
  importOffers: async (_db: unknown, label: string, offers: unknown[]) => {
    imported.push({ label, offers });
    return offers.map((_, i) => i + 1);
  },
}));

import { POST } from "../app/api/admin/produtos/route";
import { toImportedOffer } from "../lib/import-service";

const good = {
  externalId: "MLB79071289",
  title: "Creatina 300g  Dark Lab",
  url: "https://www.mercadolivre.com.br/creatina/p/MLB79071289",
  price: 37.9,
  originalPrice: 78.9,
  imageUrl: "https://http2.mlstatic.com/x.webp",
  pix: true,
};
const post = (body: unknown, token = "segredo") =>
  POST(new Request("http://localhost/api/admin/produtos", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }));

describe("toImportedOffer", () => {
  it("monta a oferta do Mercado Livre com preço de/por e Pix", () => {
    expect(toImportedOffer(good)).toEqual({
      store: "mercadolivre",
      externalId: "MLB79071289",
      title: "Creatina 300g Dark Lab",
      url: good.url,
      price: 37.9,
      originalPrice: 78.9,
      shipping: null,
      currency: "BRL",
      imageUrl: good.imageUrl,
      attributes: { pagamento: "pix" },
    });
  });

  it("recusa id, link fora do Mercado Livre, http e preço ruim; ignora 'de' menor que o preço", () => {
    expect(toImportedOffer({ ...good, externalId: "123" })).toMatch(/externalId/);
    expect(toImportedOffer({ ...good, url: "https://evil.com/p/MLB1" })).toMatch(/link/);
    expect(toImportedOffer({ ...good, url: "http://www.mercadolivre.com.br/p/MLB1" })).toMatch(/link/);
    expect(toImportedOffer({ ...good, url: "https://mercadolivre.com.br.evil.com/p" })).toMatch(/link/);
    expect(toImportedOffer({ ...good, price: 0 })).toMatch(/preço/);
    expect(toImportedOffer({ ...good, price: "10" })).toMatch(/preço/);
    const o = toImportedOffer({ ...good, originalPrice: 10, imageUrl: "javascript:x" });
    expect(typeof o !== "string" && "originalPrice" in o).toBe(false);
    expect(typeof o !== "string" && o.imageUrl).toBeUndefined();
  });
});

describe("POST /api/admin/produtos", () => {
  const original = process.env.ADMIN_TOKEN;
  beforeEach(() => {
    imported.length = 0;
    process.env.ADMIN_TOKEN = "segredo";
  });
  afterEach(() => {
    process.env.ADMIN_TOKEN = original;
  });

  it("exige o token", async () => {
    expect((await post({ offers: [good] }, "errado")).status).toBe(401);
    delete process.env.ADMIN_TOKEN;
    expect((await post({ offers: [good] })).status).toBe(503);
    expect(imported).toHaveLength(0);
  });

  it("importa os válidos, sem repetir, e lista os recusados", async () => {
    const res = await post({ label: "ml mais vendidos", offers: [good, good, { ...good, externalId: "x" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 1, productIds: [1], rejected: ["externalId inválido (esperado MLB seguido de números)"] });
    expect(imported[0].label).toBe("ml mais vendidos");
  });

  it("400 sem lista ou com lista grande demais", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ offers: Array(201).fill(good) })).status).toBe(400);
  });
});
