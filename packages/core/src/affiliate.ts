import { isAllowedUrl } from "./stores";
import type { StoreId } from "./types";

/** Aplica os parâmetros de AFFILIATE_PARAMS_<LOJA> (formato query string, ex.: "tag=meutag-20"). */
export function affiliateUrl(
  url: string,
  store: StoreId,
  env: Record<string, string | undefined>,
): string {
  if (!isAllowedUrl(url, store)) throw new Error(`URL fora da allowlist: ${url}`);
  const u = new URL(url);
  const raw = env[`AFFILIATE_PARAMS_${store.toUpperCase()}`];
  if (raw) for (const [k, v] of new URLSearchParams(raw)) u.searchParams.set(k, v);
  return u.toString();
}
