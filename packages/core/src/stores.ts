import { STORE_IDS, type StoreId } from "./types";

export const STORES: Record<StoreId, { name: string; domains: string[]; experimental?: boolean }> = {
  mercadolivre: { name: "Mercado Livre", domains: ["mercadolivre.com.br", "mercadolibre.com"] },
  amazon: { name: "Amazon", domains: ["amazon.com.br"] },
  shopee: { name: "Shopee", domains: ["shopee.com.br"] },
  magalu: { name: "Magalu", domains: ["magazineluiza.com.br", "magalu.com"] },
  aliexpress: { name: "AliExpress", domains: ["aliexpress.com"] },
  tiktokshop: { name: "TikTok Shop", domains: ["tiktok.com"], experimental: true },
  kwaishop: { name: "Kwai Shop", domains: ["kwai.com"], experimental: true },
  // Lomadee affiliate network: each product carries the real store in sellerName; links go through lmdee.link
  lomadee: { name: "Lojas parceiras", domains: ["lmdee.link"] },
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

/** https page on the store site Lomadee reported for the brand ("www." ignored); false without a site. */
export function onBrandSite(url: string, site: string | undefined): boolean {
  if (!site) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return u.protocol === "https:" && (host === site || host.endsWith(`.${site}`));
  } catch {
    return false;
  }
}

/** Offer links come from the store's own domains; Lomadee ones from the brand site reported with the product. */
export function isAllowedOffer(o: { url: string; store: StoreId; attributes: Record<string, string> }): boolean {
  return o.store === "lomadee" ? onBrandSite(o.url, o.attributes.site) : isAllowedUrl(o.url, o.store);
}
