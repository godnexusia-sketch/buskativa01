import type { MetadataRoute } from "next";
import { listProducts } from "@buskativa/db";
import { SITEMAP_PRODUCT_LIMIT, sitemapEntries } from "../lib/seo";
import { getDb } from "../lib/server";
import { siteUrl } from "../lib/site";

// Depende do banco: gerado a cada requisição, nunca no build (DATABASE_URL pode não existir lá).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let products: { id: number; lastModified: Date }[] = [];
  try {
    const { items } = await listProducts(getDb(), { order: "recentes", limit: SITEMAP_PRODUCT_LIMIT, offset: 0 });
    products = items.map((p) => ({ id: p.productId, lastModified: p.observedAt }));
  } catch (err) {
    console.error("sitemap: falha ao listar produtos, publicando só as páginas fixas", err);
  }
  return sitemapEntries(siteUrl(), products, new Date());
}
