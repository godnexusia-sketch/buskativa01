import type { Connector } from "@buskativa/core";
import { amazonPaapiConnector, paapiSearchItems } from "./amazon-paapi";
import { browserConnector } from "./browser-connector";
import { BROWSER_STORES } from "./browser-stores";
import { demoConnectors } from "./demo";
import { createLimiter } from "./limiter";
import { mercadoLivreConnector } from "./mercadolivre";

export { closeBrowser } from "./browser";
export { FETCH_TIMEOUT_MS } from "./browser-connector";
export { demoConnectors } from "./demo";

/** BROWSER_MAX_CONTEXTS: browser contexts open at once across all stores (default 1; one Chromium page fits 512 MB). */
export function browserMaxContexts(env: Record<string, string | undefined>): number {
  const n = Number(env.BROWSER_MAX_CONTEXTS);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function createConnectors(env: Record<string, string | undefined>): Connector[] {
  if (env.CONNECTORS === "demo") return demoConnectors();
  const contextSlots = createLimiter(browserMaxContexts(env), 0);
  const list: Connector[] = [mercadoLivreConnector({ accessToken: env.ML_ACCESS_TOKEN })];
  list.push(
    env.AMAZON_PAAPI_ACCESS_KEY && env.AMAZON_PAAPI_SECRET_KEY && env.AMAZON_PAAPI_PARTNER_TAG
      ? amazonPaapiConnector({
          searchItems: paapiSearchItems({
            accessKey: env.AMAZON_PAAPI_ACCESS_KEY,
            secretKey: env.AMAZON_PAAPI_SECRET_KEY,
            partnerTag: env.AMAZON_PAAPI_PARTNER_TAG,
          }),
        })
      : browserConnector("amazon", BROWSER_STORES.amazon, { contextSlots }),
  );
  for (const id of ["magalu", "shopee", "aliexpress", "tiktokshop"] as const) {
    list.push(browserConnector(id, BROWSER_STORES[id], { contextSlots }));
  }
  if (env.KWAI_ENABLED === "true") list.push(browserConnector("kwaishop", BROWSER_STORES.kwaishop, { contextSlots }));
  return list;
}
