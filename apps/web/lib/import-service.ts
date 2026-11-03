import type { Offer } from "@buskativa/core";
import { STORES } from "@buskativa/core/stores";
import { type Db, importOffers } from "@buskativa/db";
import type { ServiceResult } from "./coupon-service";

const MAX_ITEMS = 200;

interface RawItem {
  externalId?: unknown;
  title?: unknown;
  url?: unknown;
  price?: unknown;
  originalPrice?: unknown;
  imageUrl?: unknown;
  pix?: unknown;
}

const isStoreUrl = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && STORES.mercadolivre.domains.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1_000_000 ? Math.round(v * 100) / 100 : null);

/** Validates one item; returns the Offer or a pt-BR reason. */
export function toImportedOffer(raw: RawItem): Offer | string {
  const id = typeof raw.externalId === "string" ? raw.externalId.trim() : "";
  if (!/^MLB\d{5,15}$/.test(id)) return "externalId inválido (esperado MLB seguido de números)";
  const title = typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim() : "";
  if (title.length < 3 || title.length > 300) return `${id}: título precisa ter de 3 a 300 caracteres`;
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!isStoreUrl(url)) return `${id}: o link precisa ser https do Mercado Livre`;
  const price = money(raw.price);
  if (price === null) return `${id}: preço inválido`;
  const original = money(raw.originalPrice);
  const image = typeof raw.imageUrl === "string" && raw.imageUrl.startsWith("https://") ? raw.imageUrl : undefined;
  return {
    store: "mercadolivre",
    externalId: id,
    title,
    url,
    price,
    ...(original !== null && original > price ? { originalPrice: original } : {}),
    shipping: null,
    currency: "BRL",
    imageUrl: image,
    attributes: raw.pix === true ? { pagamento: "pix" } : {},
  };
}

/** Admin import of Mercado Livre offers; invalid items are reported and skipped, never half-saved. */
export async function importOffersAdmin(db: Db, input: unknown, now: Date): Promise<ServiceResult> {
  const body = input as { label?: unknown; offers?: unknown } | null;
  const items = Array.isArray(body?.offers) ? (body.offers as RawItem[]) : null;
  if (!items || items.length === 0 || items.length > MAX_ITEMS) {
    return { status: 400, body: { error: `Envie "offers" com 1 a ${MAX_ITEMS} produtos.` } };
  }
  const label = typeof body?.label === "string" && body.label.trim().length >= 2 ? body.label.trim().slice(0, 120) : "importação mercado livre";
  const offers: Offer[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const r = toImportedOffer(raw ?? {});
    if (typeof r === "string") rejected.push(r);
    else if (!seen.has(r.externalId)) {
      seen.add(r.externalId);
      offers.push(r);
    }
  }
  const ids = offers.length ? await importOffers(db, label, offers, now) : [];
  return { status: 200, body: { imported: ids.length, productIds: ids, rejected } };
}
