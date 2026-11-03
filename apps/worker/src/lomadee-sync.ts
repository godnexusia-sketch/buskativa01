import { type LomadeeCoupon, lomadeeClient } from "@buskativa/connectors";
import { isAllowedOffer, parseCouponText, validateCoupon } from "@buskativa/core";
import { type Db, deactivateCoupon, listActiveCoupons, syncCatalogOffers, upsertCoupon } from "@buskativa/db";

type Client = ReturnType<typeof lomadeeClient>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Walks the whole Lomadee catalog page by page (100 products each) and bulk-saves it. Paced at ~1 request per
 * 1.1 s to stay under the 60/min limit; stops at the first empty page or after `maxPages`.
 */
export async function syncLomadeeCatalog(db: Db, client: Pick<Client, "page">, opts: { maxPages?: number; pauseMs?: number; now?: () => Date } = {}) {
  const maxPages = opts.maxPages ?? 400;
  const now = opts.now ?? (() => new Date());
  let pages = 0;
  let products = 0;
  let observations = 0;
  let failures = 0;
  for (let page = 1; page <= maxPages; page++) {
    let offers;
    try {
      offers = await client.page(page);
      failures = 0;
    } catch (err) {
      // a page that still fails after the client retries is skipped; 5 in a row ends this sync
      if (++failures >= 5) throw err;
      continue;
    }
    if (offers.length === 0) break;
    const r = await syncCatalogOffers(db, offers.filter(isAllowedOffer), now());
    pages++;
    products += r.products;
    observations += r.observations;
    await sleep(opts.pauseMs ?? 1100);
  }
  return { pages, products, observations };
}

/** Turns a network coupon into the site's coupon, or null when its text gives no amount (never guessed). */
export function couponFromLomadee(c: LomadeeCoupon, now: Date) {
  const discount = parseCouponText(c.name);
  if (!discount) return null;
  const title = (c.brand ? `${c.brand}: ${c.name}` : c.name).slice(0, 120);
  const v = validateCoupon(
    {
      store: "lomadee",
      code: c.code,
      title,
      description: c.name.slice(0, 500),
      ...discount,
      validUntil: c.endAt,
      sourceUrl: c.shortUrl,
      source: "oficial",
    },
    now,
  );
  return v.ok ? v.value : null;
}

/** Saves every valid coupon of the network; a code repeated by two brands keeps the one that lasts longer. */
export async function syncLomadeeCoupons(db: Db, client: Pick<Client, "coupons">, now = new Date()) {
  const list = await client.coupons();
  const byCode = new Map<string, NonNullable<ReturnType<typeof couponFromLomadee>>>();
  let skipped = 0;
  for (const c of list) {
    const v = couponFromLomadee(c, now);
    if (!v) {
      skipped++;
      continue;
    }
    const prev = byCode.get(v.code);
    const end = (x: typeof v) => x.validUntil?.getTime() ?? Infinity;
    if (!prev || end(v) > end(prev)) byCode.set(v.code, v);
  }
  for (const v of byCode.values()) await upsertCoupon(db, v);
  // coupons the network stopped listing leave the site; a much shorter answer than usual (a failed page)
  // is not trusted for that
  const active = await listActiveCoupons(db, "lomadee", now, 1000);
  let removed = 0;
  if (byCode.size >= active.length * 0.7) {
    for (const c of active) {
      if (!byCode.has(c.code) && (await deactivateCoupon(db, c.id, now))) removed++;
    }
  }
  return { saved: byCode.size, skipped, removed };
}
