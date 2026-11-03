import { normalizeQuery } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { amazonPaapiConnector } from "../src/amazon-paapi";

describe("amazonPaapiConnector", () => {
  it("mapeia itens e ignora os sem preço", async () => {
    const c = amazonPaapiConnector({
      searchItems: async (keywords, count) => {
        expect(keywords).toBe("fone bluetooth");
        expect(count).toBe(5);
        return [
          {
            ASIN: "B0ABC",
            DetailPageURL: "https://www.amazon.com.br/dp/B0ABC?tag=x-20",
            ItemInfo: { Title: { DisplayValue: "Fone JBL" } },
            Offers: { Listings: [{ Price: { Amount: 199.9 } }] },
            Images: { Primary: { Medium: { URL: "https://m.media-amazon.com/i.jpg" } } },
          },
          { ASIN: "B0SEM", DetailPageURL: "https://www.amazon.com.br/dp/B0SEM", ItemInfo: { Title: { DisplayValue: "Sem preço" } } },
        ];
      },
    });
    const offers = await c.search(normalizeQuery("fone bluetooth"), { limit: 5 });
    expect(offers).toEqual([
      {
        store: "amazon",
        externalId: "B0ABC",
        title: "Fone JBL",
        url: "https://www.amazon.com.br/dp/B0ABC?tag=x-20",
        price: 199.9,
        shipping: null,
        currency: "BRL",
        imageUrl: "https://m.media-amazon.com/i.jpg",
        attributes: {},
      },
    ]);
  });

  it("chamada que não responde vira TIMEOUT", async () => {
    const c = amazonPaapiConnector({ searchItems: () => new Promise(() => {}), timeoutMs: 20 });
    await expect(c.search(normalizeQuery("fone"), { limit: 5 })).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
