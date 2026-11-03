import type { NormalizedQuery, Offer } from "@buskativa/core";
import { parseAmazon, parseGeneric } from "./parse";

export type BrowserStoreId = "amazon" | "magalu" | "shopee" | "aliexpress" | "tiktokshop" | "kwaishop";

export interface BrowserStoreConfig {
  buildUrl(q: NormalizedQuery): string;
  parse(html: string, url: string): Offer[];
  experimental?: boolean;
}

const enc = encodeURIComponent;
const plus = (s: string) => s.split(" ").map(enc).join("+");

export const BROWSER_STORES: Record<BrowserStoreId, BrowserStoreConfig> = {
  amazon: {
    buildUrl: (q) => `https://www.amazon.com.br/s?k=${plus(q.termo)}`,
    parse: (html, url) => parseAmazon(html, url),
  },
  magalu: {
    buildUrl: (q) => `https://www.magazineluiza.com.br/busca/${plus(q.termo)}/`,
    parse: (html, url) => parseGeneric(html, { store: "magalu", baseUrl: url, linkPattern: /\/p\/([a-z0-9]+)\//i }),
  },
  shopee: {
    buildUrl: (q) => `https://shopee.com.br/search?keyword=${enc(q.termo)}`,
    parse: (html, url) => parseGeneric(html, { store: "shopee", baseUrl: url, linkPattern: /-i\.(\d+\.\d+)/ }),
  },
  aliexpress: {
    buildUrl: (q) => `https://pt.aliexpress.com/w/wholesale-${q.termo.split(" ").map(enc).join("-")}.html`,
    parse: (html, url) => parseGeneric(html, { store: "aliexpress", baseUrl: url, linkPattern: /\/item\/(\d+)\.html/ }),
  },
  tiktokshop: {
    experimental: true,
    buildUrl: (q) => `https://www.tiktok.com/shop/s/${enc(q.termo)}`,
    parse: (html, url) => parseGeneric(html, { store: "tiktokshop", baseUrl: url, linkPattern: /\/shop\/pdp\/[^/?]+\/(\d+)/ }),
  },
  kwaishop: {
    experimental: true,
    buildUrl: (q) => `https://www.kwai.com/search?keyword=${enc(q.termo)}`,
    parse: (html, url) => parseGeneric(html, { store: "kwaishop", baseUrl: url, linkPattern: /\/(?:product|item)\/(\d+)/ }),
  },
};
