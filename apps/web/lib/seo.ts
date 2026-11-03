import { INSTITUTIONAL_PATHS } from "./site";

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

export const SITEMAP_PRODUCT_LIMIT = 5000;

export function sitemapEntries(
  base: string,
  products: { id: number; lastModified?: Date }[],
  now: Date,
): SitemapEntry[] {
  const fixed: SitemapEntry[] = [
    { url: `${base}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/ofertas`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/cupons`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    ...INSTITUTIONAL_PATHS.map((p) => ({ url: `${base}${p}`, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
  const seen = new Set<number>();
  const items: SitemapEntry[] = [];
  for (const p of products) {
    if (seen.has(p.id) || items.length >= SITEMAP_PRODUCT_LIMIT) continue;
    seen.add(p.id);
    items.push({ url: `${base}/produto/${p.id}`, lastModified: p.lastModified, changeFrequency: "daily", priority: 0.6 });
  }
  return [...fixed, ...items];
}

export interface ProductLd {
  id: number;
  title: string;
  imageUrl: string | null;
  storeName: string;
  priceCents: number | null;
}

/** JSON-LD schema.org/Product. Sem preço conhecido, omite `offers` (não inventa dados). */
export function productJsonLd(base: string, p: ProductLd): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    url: `${base}/produto/${p.id}`,
  };
  if (p.imageUrl) ld.image = p.imageUrl;
  if (p.priceCents !== null && p.priceCents > 0) {
    // availability/itemCondition ficam de fora de propósito: não temos esses dados das lojas.
    ld.offers = {
      "@type": "Offer",
      price: (p.priceCents / 100).toFixed(2),
      priceCurrency: "BRL",
      // the canonical product page, not /ir/ (a redirect disallowed in robots.txt)
      url: `${base}/produto/${p.id}`,
      seller: { "@type": "Organization", name: p.storeName },
    };
  }
  return ld;
}

/** Serializa para <script type="application/ld+json"> sem permitir fechar a tag. */
export function jsonLdString(ld: Record<string, unknown>): string {
  return JSON.stringify(ld).replace(/</g, "\\u003c");
}

export function productDescription(title: string, storeName: string, priceLabel: string | null): string {
  return priceLabel
    ? `${title} na ${storeName} por ${priceLabel}. Veja o histórico de preço e o melhor momento para comprar.`
    : `${title} na ${storeName}. Veja o histórico de preço e o melhor momento para comprar.`;
}
