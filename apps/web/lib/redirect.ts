import { affiliateUrl } from "@buskativa/core";
import { type Db, getProduct, recordClick, setProductShortUrl } from "@buskativa/db";
import { lomadeeShortUrl } from "./lomadee-link";

export class RedirectNotAllowedError extends Error {
  constructor(url: string) {
    super(`URL fora da allowlist: ${url}`);
    this.name = "RedirectNotAllowedError";
  }
}

type Product = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

const isShortLink = (u: string | null | undefined): u is string => !!u && u.startsWith("https://lmdee.link/");

/** Same host as the store site Lomadee reported for the brand (www. ignored). */
function onBrandSite(url: string, site: string | undefined): boolean {
  if (!site) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return u.protocol === "https:" && (host === site || host.endsWith(`.${site}`));
  } catch {
    return false;
  }
}

/**
 * Lomadee products go through the network's affiliate short link, created on the first click and cached on the
 * product. Without a key, or when the API gives no link, the plain page is used only if it is on the brand's site.
 */
async function lomadeeUrl(db: Db, product: Product, env: Record<string, string | undefined>): Promise<string> {
  const attrs = product.attributes;
  if (isShortLink(attrs.shortUrl)) return attrs.shortUrl;
  if (env.LOMADEE_API_KEY && attrs.organizationId) {
    const short = await lomadeeShortUrl({ apiKey: env.LOMADEE_API_KEY }, attrs.organizationId, product.url).catch(() => null);
    if (isShortLink(short)) {
      await setProductShortUrl(db, product.id, short).catch((err) => console.error("falha ao guardar link curto", err));
      return short;
    }
  }
  if (onBrandSite(product.url, attrs.site)) return product.url;
  throw new RedirectNotAllowedError(product.url);
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
  if (product.store === "lomadee") url = await lomadeeUrl(db, product, env);
  else {
    try {
      url = affiliateUrl(product.url, product.store, env);
    } catch {
      throw new RedirectNotAllowedError(product.url);
    }
  }
  try {
    await recordClick(db, productId, referer);
  } catch (err) {
    console.error("falha ao registrar clique", err);
  }
  return url;
}
