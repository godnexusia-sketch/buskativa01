import { readFileSync } from "node:fs";
import { normalizeQuery } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { browserConnector } from "../src/browser-connector";
import { BROWSER_STORES } from "../src/browser-stores";
import { createConnectors } from "../src/index";
import { createLimiter } from "../src/limiter";

const html = readFileSync(new URL("../fixtures/amazon-search.html", import.meta.url), "utf8");

describe("browserConnector", () => {
  it("monta a URL da loja, busca o HTML e aplica o limite", async () => {
    let requested = "";
    const c = browserConnector("amazon", BROWSER_STORES.amazon, {
      fetchHtml: async (url) => {
        requested = url;
        return html;
      },
      limiter: createLimiter(1, 0),
    });
    const offers = await c.search(normalizeQuery("Fone Bluetooth"), { limit: 1 });
    expect(requested).toBe("https://www.amazon.com.br/s?k=fone+bluetooth");
    expect(offers).toHaveLength(1);
  });
});

describe("createConnectors", () => {
  it("modo demo e modo real", () => {
    expect(createConnectors({ CONNECTORS: "demo" }).map((c) => c.id)).toEqual(["mercadolivre", "amazon", "magalu"]);
    expect(createConnectors({}).map((c) => c.id)).toEqual([
      "mercadolivre", "amazon", "magalu", "shopee", "aliexpress", "tiktokshop",
    ]);
    expect(createConnectors({ KWAI_ENABLED: "true" }).map((c) => c.id)).toContain("kwaishop");
  });
});
