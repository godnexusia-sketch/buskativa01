import { affiliateUrl } from "@buskativa/core";
import { type Db, getProduct, recordClick } from "@buskativa/db";

export async function resolveRedirect(
  db: Db,
  productId: number,
  env: Record<string, string | undefined>,
  referer: string | null,
): Promise<string | null> {
  const product = await getProduct(db, productId);
  if (!product) return null;
  const url = affiliateUrl(product.url, product.store, env);
  await recordClick(db, productId, referer);
  return url;
}
