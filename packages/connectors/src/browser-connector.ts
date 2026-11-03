import { type Connector, ConnectorError } from "@buskativa/core";
import { fetchRendered } from "./browser";
import type { BrowserStoreConfig, BrowserStoreId } from "./browser-stores";
import { createLimiter, type Limiter } from "./limiter";

/** Cap for one rendered fetch (30 s navigation + 10 s network idle + margin). */
export const FETCH_TIMEOUT_MS = 45000;

type FetchHtml = (url: string, signal: AbortSignal) => Promise<string>;

/** Rejects with TIMEOUT after `ms` and aborts the signal so the fetch can stop its own work. */
async function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort();
      reject(new ConnectorError("TIMEOUT", `sem resposta em ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([work(ac.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function browserConnector(
  id: BrowserStoreId,
  cfg: BrowserStoreConfig,
  deps: { fetchHtml?: FetchHtml; limiter?: Limiter; fetchTimeoutMs?: number } = {},
): Connector {
  const fetchHtml: FetchHtml = deps.fetchHtml ?? ((url, signal) => fetchRendered(url, { signal }));
  const limit = deps.limiter ?? createLimiter(1, 5000);
  const fetchTimeoutMs = deps.fetchTimeoutMs ?? FETCH_TIMEOUT_MS;
  return {
    id,
    experimental: cfg.experimental,
    async search(q, { limit: max }) {
      const url = cfg.buildUrl(q);
      // the deadline runs inside the limited section: waiting for a slot does not count against it
      const html = await limit(() => withDeadline((signal) => fetchHtml(url, signal), fetchTimeoutMs));
      return cfg.parse(html, url).slice(0, max);
    },
  };
}
