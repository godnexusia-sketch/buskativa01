import { STORE_IDS, type StoreId } from "./types";

export const STORES: Record<StoreId, { name: string; domains: string[]; experimental?: boolean }> = {
  mercadolivre: { name: "Mercado Livre", domains: ["mercadolivre.com.br", "mercadolibre.com"] },
  amazon: { name: "Amazon", domains: ["amazon.com.br"] },
  shopee: { name: "Shopee", domains: ["shopee.com.br"] },
  magalu: { name: "Magalu", domains: ["magazineluiza.com.br", "magalu.com"] },
  aliexpress: { name: "AliExpress", domains: ["aliexpress.com"] },
  tiktokshop: { name: "TikTok Shop", domains: ["tiktok.com"], experimental: true },
  kwaishop: { name: "Kwai Shop", domains: ["kwai.com"], experimental: true },
};

export function storeForUrl(url: string): StoreId | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  for (const id of STORE_IDS) {
    if (STORES[id].domains.some((d) => host === d || host.endsWith(`.${d}`))) return id;
  }
  return null;
}

export function isAllowedUrl(url: string, store?: StoreId): boolean {
  const found = storeForUrl(url);
  return found !== null && (store === undefined || found === store);
}
