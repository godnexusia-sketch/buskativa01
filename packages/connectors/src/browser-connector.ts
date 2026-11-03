import type { Connector } from "@buskativa/core";
import { fetchRendered } from "./browser";
import type { BrowserStoreConfig, BrowserStoreId } from "./browser-stores";
import { createLimiter, type Limiter } from "./limiter";

export function browserConnector(
  id: BrowserStoreId,
  cfg: BrowserStoreConfig,
  deps: { fetchHtml?: (url: string) => Promise<string>; limiter?: Limiter } = {},
): Connector {
  const fetchHtml = deps.fetchHtml ?? ((url: string) => fetchRendered(url));
  const limit = deps.limiter ?? createLimiter(1, 5000);
  return {
    id,
    experimental: cfg.experimental,
    async search(q, { limit: max }) {
      const url = cfg.buildUrl(q);
      const html = await limit(() => fetchHtml(url));
      return cfg.parse(html, url).slice(0, max);
    },
  };
}
