import { STORE_IDS, type StoreId } from "@buskativa/core";
import { isCategoryId, type CategoryId } from "@buskativa/core/categories";
import { PRODUCT_ORDERS, type ProductOrder } from "@buskativa/db";
import { formatReais, parseReais } from "./offer-filters";

export const OFERTAS_PAGE_SIZE = 24;
const MAX_PAGE = 10000;

export interface OfertasParams {
  pagina: number;
  loja: StoreId | null;
  categoria: CategoryId | null;
  /** só produtos com preço "de/por" */
  desconto: boolean;
  minCents: number | undefined;
  maxCents: number | undefined;
  ordem: ProductOrder;
}

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Never throws: anything invalid falls back to the default. */
export function parseOfertasParams(raw: Raw): OfertasParams {
  const page = Math.floor(Number(first(raw.pagina)));
  const loja = first(raw.loja);
  const ordem = first(raw.ordem);
  const categoria = first(raw.categoria);
  let minCents = parseReais(first(raw.min));
  let maxCents = parseReais(first(raw.max));
  if (minCents !== undefined && maxCents !== undefined && minCents > maxCents) [minCents, maxCents] = [maxCents, minCents];
  return {
    pagina: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    loja: STORE_IDS.includes(loja as StoreId) ? (loja as StoreId) : null,
    categoria: isCategoryId(categoria) ? categoria : null,
    desconto: first(raw.desconto) === "1",
    minCents,
    maxCents,
    ordem: PRODUCT_ORDERS.includes(ordem as ProductOrder) ? (ordem as ProductOrder) : "menor-preco",
  };
}

/** Canonical /ofertas URL for the given params; defaults are omitted. */
export function ofertasHref(p: OfertasParams): string {
  const q = new URLSearchParams();
  if (p.pagina > 1) q.set("pagina", String(p.pagina));
  if (p.categoria) q.set("categoria", p.categoria);
  if (p.loja) q.set("loja", p.loja);
  if (p.desconto) q.set("desconto", "1");
  if (p.minCents !== undefined) q.set("min", formatReais(p.minCents));
  if (p.maxCents !== undefined) q.set("max", formatReais(p.maxCents));
  if (p.ordem !== "menor-preco") q.set("ordem", p.ordem);
  const s = q.toString();
  return s ? `/ofertas?${s}` : "/ofertas";
}
