import type { Connector } from "@buskativa/core";
import { fetchRendered } from "./browser";
import type { BrowserStoreConfig, BrowserStoreId } from "./browser-stores";
import { withDeadline } from "./deadline";
import { createLimiter, type Limiter } from "./limiter";

/** Cap for one rendered fetch (30 s navigation + 10 s network idle + margin). */
export const FETCH_TIMEOUT_MS = 45000;

type FetchHtml = (url: string, signal: AbortSignal) => Promise<string>;

export function browserConnector(
  id: BrowserStoreId,
  cfg: BrowserStoreConfig,
  deps: {
    fetchHtml?: FetchHtml;
    /** Per-store limiter (default: 1 at a time, 5 s apart). */
    limiter?: Limiter;
    /** Global cap on open browser contexts, shared by every browser store (default: none). */
    contextSlots?: Limiter;
    fetchTimeoutMs?: number;
  } = {},
): Connector {
  const fetchHtml: FetchHtml = deps.fetchHtml ?? ((url, signal) => fetchRendered(url, { signal }));
  const limit = deps.limiter ?? createLimiter(1, 5000);
  const slot: Limiter = deps.contextSlots ?? ((fn) => fn());
  const fetchTimeoutMs = deps.fetchTimeoutMs ?? FETCH_TIMEOUT_MS;
  return {
    id,
    experimental: cfg.experimental,
    async search(q, { limit: max }) {
      const url = cfg.buildUrl(q);
      // the deadline runs inside both limited sections: waiting for the store's turn or for a global
      // context slot does not count against it
      const html = await limit(() => slot(() => withDeadline((signal) => fetchHtml(url, signal), fetchTimeoutMs)));
      return cfg.parse(html, url).slice(0, max);
    },
  };
}
