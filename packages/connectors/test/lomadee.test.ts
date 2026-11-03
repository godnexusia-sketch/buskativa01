import { normalizeQuery } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { lomadeeConnector } from "../src/lomadee";

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
