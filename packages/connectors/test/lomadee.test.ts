import { normalizeQuery } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { lomadeeClient, lomadeeConnector } from "../src/lomadee";

const q = normalizeQuery("air fryer");
const product = (over: Record<string, unknown> = {}) => ({
  organizationId: "org-1",
  id: "140059",
  available: true,
  name: " Air Fryer Philco 4 Litros ",
  url: "https://www.friopecas.com.br/fritadeira-philco/p",
  images: [{ url: "https://friopecas.vteximg.com.br/1.jpg" }],
  options: [{ available: true, pricing: [{ listPrice: 658, price: 598 }] }],
  ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("lomadeeConnector", () => {
  it("busca com a chave, mapeia preço de/por em reais e o nome da loja", async () => {
    const calls: { url: string; key: string | null }[] = [];
    const c = lomadeeConnector({
      apiKey: "k",
      fetch: async (url, init) => {
        calls.push({ url: String(url), key: new Headers(init?.headers).get("x-api-key") });
        return String(url).includes("/brands")
          ? json({ data: [{ id: "org-1", name: "Friopeças", site: "www.friopecas.com.br" }] })
          : json({ data: [product()] });
      },
    });
    const offers = await c.search(q, { limit: 20 });
    expect(calls.map((x) => x.key)).toEqual(["k", "k"]);
    expect(calls.find((x) => x.url.includes("/products"))?.url).toBe(
      "https://api.lomadee.com.br/affiliate/products?search=air%20fryer&limit=50&isAvailable=true",
    );
    expect(offers).toEqual([
      {
        store: "lomadee",
        externalId: "org-1:140059",
        title: "Air Fryer Philco 4 Litros",
        url: "https://www.friopecas.com.br/fritadeira-philco/p",
        price: 598,
        originalPrice: 658,
        shipping: null,
        currency: "BRL",
        sellerName: "Friopeças",
        imageUrl: "https://friopecas.vteximg.com.br/1.jpg",
        attributes: { organizationId: "org-1", site: "friopecas.com.br" },
      },
    ]);
  });

  it("ignora indisponível, sem preço e link não https; guarda as marcas em cache", async () => {
    let brandCalls = 0;
    const c = lomadeeConnector({
      apiKey: "k",
      fetch: async (url) => {
        if (String(url).includes("/brands")) {
          brandCalls++;
          return json({ data: [] });
        }
        return json({
          data: [
            product({ id: "a", available: false }),
            product({ id: "b", options: [{ pricing: [{ price: 0 }] }] }),
            product({ id: "c", url: "http://x.com/p" }),
            product({ id: "d" }),
          ],
        });
      },
    });
    expect((await c.search(q, { limit: 5 })).map((o) => o.externalId)).toEqual(["org-1:d"]);
    await c.search(q, { limit: 5 });
    expect(brandCalls).toBe(1);
  });

  it("401/429 viram BLOCKED; falha só nas marcas não derruba a busca", async () => {
    const blocked = lomadeeConnector({ apiKey: "k", fetch: async () => json({}, 429) });
    await expect(blocked.search(q, { limit: 5 })).rejects.toMatchObject({ code: "BLOCKED" });
    const noBrands = lomadeeConnector({
      apiKey: "k",
      fetch: async (url) => (String(url).includes("/brands") ? json({}, 500) : json({ data: [product()] })),
    });
    const [o] = await noBrands.search(q, { limit: 5 });
    expect(o.sellerName).toBeUndefined();
  });
});

describe("lomadeeClient.page", () => {
  it("pede a página do catálogo com 100 itens e mapeia igual à busca", async () => {
    let url = "";
    const c = lomadeeClient({
      apiKey: "k",
      fetch: async (u) => {
        if (String(u).includes("/brands")) return json({ data: [{ id: "org-1", name: "Friopeças", site: "friopecas.com.br" }] });
        url = String(u);
        return json({ data: [product()] });
      },
    });
    const offers = await c.page(7);
    expect(url).toBe("https://api.lomadee.com.br/affiliate/products?page=7&limit=100&isAvailable=true");
    expect(offers[0]).toMatchObject({ externalId: "org-1:140059", sellerName: "Friopeças", price: 598 });
  });
});

describe("lomadeeClient: falhas passageiras", () => {
  it("tenta de novo em 5xx e 429; 401 não", async () => {
    let calls = 0;
    const flaky = lomadeeClient({
      apiKey: "k",
      retryMs: 0,
      fetch: async (u) => {
        if (String(u).includes("/brands")) return json({ data: [] });
        calls++;
        return calls < 3 ? json({}, calls === 1 ? 500 : 429) : json({ data: [product()] });
      },
    });
    expect(await flaky.page(1)).toHaveLength(1);
    expect(calls).toBe(3);
    let denied = 0;
    const bad = lomadeeClient({ apiKey: "k", retryMs: 0, fetch: async () => (denied++, json({}, 401)) });
    await expect(bad.page(1)).rejects.toMatchObject({ code: "BLOCKED" });
    expect(denied).toBeLessThanOrEqual(2);
  });

  it("cupons: guarda os já lidos se uma página seguinte falhar", async () => {
    const c = lomadeeClient({
      apiKey: "k",
      retryMs: 0,
      fetch: async (u) => {
        if (String(u).includes("/brands")) return json({ data: [] });
        return String(u).includes("page=1&")
          ? json({ data: [{ code: "A10", name: "10% OFF", organizationId: "o" }], meta: { totalPages: 3 } })
          : json({}, 500);
      },
    });
    expect((await c.coupons()).map((x) => x.code)).toEqual(["A10"]);
  });
});
