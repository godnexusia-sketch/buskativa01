import { filterOffers, normalizeQuery } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { demoConnectors } from "../src/demo";

describe("demoConnectors", () => {
  it("gera ofertas determinísticas que passam no filtro", async () => {
    const q = normalizeQuery("iPhone 15 128GB preto");
    const all = (await Promise.all(demoConnectors().map((c) => c.search(q, { limit: 10 })))).flat();
    expect(all).toHaveLength(9);
    expect(filterOffers(all, q)).toHaveLength(9);
    const again = await demoConnectors()[0].search(q, { limit: 10 });
    expect(again.map((o) => o.price)).toEqual(all.slice(0, 3).map((o) => o.price));
  });
});
