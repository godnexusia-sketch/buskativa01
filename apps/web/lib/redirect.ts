import { affiliateUrl } from "@buskativa/core";
import { type Db, getProduct, recordClick } from "@buskativa/db";

export class RedirectNotAllowedError extends Error {
  constructor(url: string) {
    super(`URL fora da allowlist: ${url}`);
    this.name = "RedirectNotAllowedError";
  }
}

export async function resolveRedirect(
  db: Db,
  productId: number,
  env: Record<string, string | undefined>,
  referer: string | null,
): Promise<string | null> {
  const product = await getProduct(db, productId);
  if (!product) return null;
  let url: string;
  try {
    url = affiliateUrl(product.url, product.store, env);
  } catch {
    throw new RedirectNotAllowedError(product.url);
  }
  try {
    await recordClick(db, productId, referer);
  } catch (err) {
    console.error("falha ao registrar clique", err);
  }
  return url;
}
