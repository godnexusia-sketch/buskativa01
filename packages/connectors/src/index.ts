import type { Connector } from "@buskativa/core";
import { amazonPaapiConnector, paapiSearchItems } from "./amazon-paapi";
import { browserConnector } from "./browser-connector";
import { BROWSER_STORES } from "./browser-stores";
import { demoConnectors } from "./demo";
import { mercadoLivreConnector } from "./mercadolivre";

export { closeBrowser } from "./browser";
export { demoConnectors } from "./demo";

export function createConnectors(env: Record<string, string | undefined>): Connector[] {
  if (env.CONNECTORS === "demo") return demoConnectors();
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
      : browserConnector("amazon", BROWSER_STORES.amazon),
  );
  for (const id of ["magalu", "shopee", "aliexpress", "tiktokshop"] as const) {
    list.push(browserConnector(id, BROWSER_STORES[id]));
  }
  if (env.KWAI_ENABLED === "true") list.push(browserConnector("kwaishop", BROWSER_STORES.kwaishop));
  return list;
}
