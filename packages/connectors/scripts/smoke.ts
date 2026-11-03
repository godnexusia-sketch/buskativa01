import { mkdirSync, writeFileSync } from "node:fs";
import { normalizeQuery } from "@buskativa/core";
import { closeBrowser, fetchRendered } from "../src/browser";
import { BROWSER_STORES, type BrowserStoreId } from "../src/browser-stores";
import { mercadoLivreConnector } from "../src/mercadolivre";

const [store, ...rest] = process.argv.slice(2);
const q = normalizeQuery(rest.join(" ") || "fone bluetooth");

try {
  if (store === "mercadolivre") {
    const offers = await mercadoLivreConnector({ accessToken: process.env.ML_ACCESS_TOKEN }).search(q, { limit: 10 });
    console.log(`${offers.length} ofertas`, offers.slice(0, 3));
  } else {
    const cfg = BROWSER_STORES[store as BrowserStoreId];
    if (!cfg) throw new Error(`loja desconhecida: ${store}`);
    const url = cfg.buildUrl(q);
    const html = await fetchRendered(url);
    mkdirSync(new URL("../fixtures/live/", import.meta.url), { recursive: true });
    writeFileSync(new URL(`../fixtures/live/${store}.html`, import.meta.url), html);
    const offers = cfg.parse(html, url);
    console.log(`${url}\n${offers.length} ofertas`, offers.slice(0, 3));
  }
} finally {
  await closeBrowser();
}
