import { COUPON_CONFIDENCE_ORDER, couponConfidence, toCents, type CouponConfidence, type CouponValue, type NormalizedQuery, type Offer, type PricePoint, type StoreId, type StoreStatus } from "@buskativa/core";
import { and, desc, eq, getTableColumns, gt, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "./client";
import { clicks, couponVotes, coupons, priceObservations, products, queries, queryResults, searchRuns } from "./schema";

async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  const res = (await db.execute(query)) as unknown as { rows: T[] };
  return res.rows;
}

export async function upsertQuery(db: Db, nq: NormalizedQuery) {
  const [row] = await db
    .insert(queries)
    .values({ original: nq.original, normalized: nq, hash: nq.hash })
    .onConflictDoUpdate({ target: queries.hash, set: { watched: true } })
    .returning({ id: queries.id, original: queries.original, hash: queries.hash });
  return row;
}

export async function createRun(db: Db, queryId: number, startedAt = new Date()): Promise<number> {
  const [r] = await db.insert(searchRuns).values({ queryId, startedAt }).returning({ id: searchRuns.id });
  return r.id;
}

export async function saveOffers(db: Db, runId: number, offers: Offer[], observedAt = new Date()): Promise<number[]> {
  const ids: number[] = [];
  for (const [position, o] of offers.entries()) {
    const fields = {
      title: o.title,
      url: o.url,
      imageUrl: o.imageUrl ?? null,
      attributes: o.attributes,
      sellerName: o.sellerName ?? null,
      sellerRating: o.sellerRating ?? null,
    };
    const [p] = await db
      .insert(products)
      .values({ store: o.store, externalId: o.externalId, ...fields })
      .onConflictDoUpdate({ target: [products.store, products.externalId], set: fields })
      .returning({ id: products.id });
    const priceCents = toCents(o.price);
    const shippingCents = o.shipping === null ? null : toCents(o.shipping);
    const originalPriceCents = o.originalPrice === undefined ? null : toCents(o.originalPrice);
    await db
      .insert(priceObservations)
      .values({ productId: p.id, priceCents, originalPriceCents, shippingCents, observedAt });
    await db
      .insert(queryResults)
      .values({ runId, productId: p.id, position, priceCents, originalPriceCents, shippingCents });
    ids.push(p.id);
  }
  return ids;
}

export async function updateRunStoreStatus(db: Db, runId: number, store: StoreId, status: StoreStatus) {
  await db
    .update(searchRuns)
    .set({ storeStatus: sql`${searchRuns.storeStatus} || ${JSON.stringify({ [store]: status })}::jsonb` })
    .where(eq(searchRuns.id, runId));
}

export async function finishRun(db: Db, runId: number, at = new Date()) {
  const [run] = await db
    .update(searchRuns)
    .set({ status: "done", finishedAt: at })
    .where(eq(searchRuns.id, runId))
    .returning({ queryId: searchRuns.queryId });
  if (run) await db.update(queries).set({ lastRunAt: at }).where(eq(queries.id, run.queryId));
}

function pagamentoOf(attributes: Record<string, string>): "app" | "pix" | null {
  const p = attributes.pagamento;
  return p === "app" || p === "pix" ? p : null;
}

export async function getRunWithResults(db: Db, runId: number) {
  const [run] = await db
    .select({
      id: searchRuns.id,
      status: searchRuns.status,
      storeStatus: searchRuns.storeStatus,
      startedAt: searchRuns.startedAt,
      finishedAt: searchRuns.finishedAt,
      query: queries.normalized,
    })
    .from(searchRuns)
    .innerJoin(queries, eq(queries.id, searchRuns.queryId))
    .where(eq(searchRuns.id, runId));
  if (!run) return null;
  const results = await db
    .select({
      productId: products.id,
      store: products.store,
      title: products.title,
      imageUrl: products.imageUrl,
      priceCents: queryResults.priceCents,
      originalPriceCents: queryResults.originalPriceCents,
      shippingCents: queryResults.shippingCents,
      attributes: products.attributes,
    })
    .from(queryResults)
    .innerJoin(products, eq(products.id, queryResults.productId))
    .where(eq(queryResults.runId, runId))
    .orderBy(sql`${queryResults.priceCents} + coalesce(${queryResults.shippingCents}, 0)`);
  return {
    ...run,
    results: results.map(({ attributes, ...r }) => ({ ...r, pagamento: pagamentoOf(attributes) })),
  };
}

export type RunWithResults = NonNullable<Awaited<ReturnType<typeof getRunWithResults>>>;
export type ResultRow = RunWithResults["results"][number];

export async function getRecentRunForHash(db: Db, hash: string, now = new Date()): Promise<number | null> {
  const doneSince = new Date(now.getTime() - 15 * 60e3);
  const runningSince = new Date(now.getTime() - 2 * 60e3);
  const found = await db
    .select({ id: searchRuns.id })
    .from(searchRuns)
    .innerJoin(queries, eq(queries.id, searchRuns.queryId))
    .where(
      and(
        eq(queries.hash, hash),
        or(
          gte(searchRuns.finishedAt, doneSince),
          and(eq(searchRuns.status, "running"), gte(searchRuns.startedAt, runningSince)),
        ),
      ),
    )
    .orderBy(desc(searchRuns.startedAt))
    .limit(1);
  return found[0]?.id ?? null;
}

export async function getProduct(db: Db, id: number) {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  return p ?? null;
}

export type ProductRow = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

export async function getPriceHistory(db: Db, productId: number): Promise<PricePoint[]> {
  const obs = await db
    .select({ priceCents: priceObservations.priceCents, observedAt: priceObservations.observedAt })
    .from(priceObservations)
    .where(eq(priceObservations.productId, productId))
    .orderBy(priceObservations.observedAt, priceObservations.id);
  return obs.map((o) => ({ price: o.priceCents / 100, observedAt: o.observedAt }));
}

/** Original ("de") price of the product's most recent observation, or null. */
export async function getLatestOriginalPriceCents(db: Db, productId: number): Promise<number | null> {
  const [o] = await db
    .select({ originalPriceCents: priceObservations.originalPriceCents })
    .from(priceObservations)
    .where(eq(priceObservations.productId, productId))
    .orderBy(desc(priceObservations.observedAt), desc(priceObservations.id))
    .limit(1);
  return o?.originalPriceCents ?? null;
}

export async function latestRunIdForProduct(db: Db, productId: number): Promise<number | null> {
  const [r] = await db
    .select({ runId: queryResults.runId })
    .from(queryResults)
    .where(eq(queryResults.productId, productId))
    .orderBy(desc(queryResults.id))
    .limit(1);
  return r?.runId ?? null;
}

export async function recordClick(db: Db, productId: number, referer: string | null) {
  await db.insert(clicks).values({ productId, referer });
}

export async function listWatchedQueries(db: Db, limit: number) {
  return db
    .select({ id: queries.id, original: queries.original, lastRunAt: queries.lastRunAt })
    .from(queries)
    .where(eq(queries.watched, true))
    .orderBy(sql`${queries.lastRunAt} asc nulls first`)
    .limit(limit);
}

export async function queriesWithRecentChange(db: Db, now: Date, hours = 24): Promise<Set<number>> {
  const since = new Date(now.getTime() - hours * 3600e3).toISOString();
  const found = await rows<{ query_id: number }>(
    db,
    sql`select distinct query_id from (
          select sr.query_id
          from search_runs sr join query_results qr on qr.run_id = sr.id
          where sr.started_at > ${since}::timestamptz
          group by sr.query_id, qr.product_id
          having count(distinct qr.price_cents) > 1
        ) t`,
  );
  return new Set(found.map((r) => Number(r.query_id)));
}

export interface Drop {
  productId: number;
  store: StoreId;
  title: string;
  imageUrl: string | null;
  nowCents: number;
  prevAvgCents: number;
  drop: number;
}

export async function topDrops(db: Db, now: Date, limit: number): Promise<Drop[]> {
  const day = new Date(now.getTime() - 24 * 3600e3).toISOString();
  const month = new Date(now.getTime() - 30 * 24 * 3600e3).toISOString();
  const found = await rows<{
    id: number; store: StoreId; title: string; image_url: string | null; now_min: number; prev_avg: number;
  }>(
    db,
    sql`with recent as (
          select product_id, min(price_cents)::float8 as now_min from price_observations
          where observed_at > ${day}::timestamptz group by product_id
        ), prev as (
          select product_id, avg(price_cents)::float8 as prev_avg from price_observations
          where observed_at <= ${day}::timestamptz and observed_at > ${month}::timestamptz group by product_id
        )
        select p.id, p.store, p.title, p.image_url, r.now_min, prev.prev_avg
        from recent r join prev on prev.product_id = r.product_id join products p on p.id = r.product_id
        where r.now_min < prev.prev_avg
        order by (prev.prev_avg - r.now_min) / prev.prev_avg desc
        limit ${limit}`,
  );
  return found.map((r) => ({
    productId: Number(r.id),
    store: r.store,
    title: r.title,
    imageUrl: r.image_url,
    nowCents: Math.round(Number(r.now_min)),
    prevAvgCents: Math.round(Number(r.prev_avg)),
    drop: (Number(r.prev_avg) - Number(r.now_min)) / Number(r.prev_avg),
  }));
}

export type CouponRow = typeof coupons.$inferSelect;
export type CouponWithConfidence = CouponRow & { confidence: CouponConfidence };

/** Creates or updates a coupon by (store, code). Vote counters are never reset. */
export async function upsertCoupon(db: Db, c: CouponValue): Promise<CouponRow & { created: boolean }> {
  const fields = {
    title: c.title,
    description: c.description,
    discountType: c.discountType,
    discountValue: c.discountValue,
    minOrderCents: c.minOrderCents,
    validUntil: c.validUntil,
    sourceUrl: c.sourceUrl,
    source: c.source,
    active: c.active,
  };
  const [row] = await db
    .insert(coupons)
    .values({ store: c.store, code: c.code, ...fields, deactivatedAt: c.active ? null : new Date() })
    .onConflictDoUpdate({
      target: [coupons.store, coupons.code],
      // reactivation clears deactivated_at; staying inactive keeps the original date
      set: { ...fields, deactivatedAt: c.active ? null : sql`coalesce(${coupons.deactivatedAt}, now())` },
    })
    .returning({ ...getTableColumns(coupons), created: sql<boolean>`(xmax = 0)` });
  return row;
}

/**
 * Active, non-expired coupons ordered by confidence (best first) then newest. The limit is applied in
 * SQL after ordering by net votes (worked - failed) then newest, so the best-voted coupons survive the
 * cut; the exact confidence ordering is then done in JS on that bounded set.
 */
export async function listActiveCoupons(
  db: Db,
  store: StoreId | undefined,
  now: Date,
  limit = 200,
): Promise<CouponWithConfidence[]> {
  const rowsDb = await db
    .select()
    .from(coupons)
    .where(
      and(
        eq(coupons.active, true),
        or(isNull(coupons.validUntil), gt(coupons.validUntil, now)),
        store ? eq(coupons.store, store) : undefined,
      ),
    )
    .orderBy(sql`(${coupons.worked} - ${coupons.failed}) desc`, desc(coupons.createdAt), desc(coupons.id))
    .limit(limit);
  return rowsDb
    .map((c) => ({ ...c, confidence: couponConfidence(c, now) }))
    .filter((c) => c.confidence !== "expirado")
    .sort((a, b) => COUPON_CONFIDENCE_ORDER[a.confidence] - COUPON_CONFIDENCE_ORDER[b.confidence]);
}

/**
 * One vote per voter per coupon; repeating the same vote is a no-op and a different
 * vote moves the counter. The coupon row is locked so counters stay consistent.
 * Returns the updated coupon, "expired" when its validity ended, or null when it does not exist or is inactive.
 */
export async function voteCoupon(
  db: Db,
  couponId: number,
  voterHash: string,
  worked: boolean,
  now = new Date(),
): Promise<CouponRow | "expired" | null> {
  return db.transaction(async (tx) => {
    const [coupon] = await tx.select().from(coupons).where(eq(coupons.id, couponId)).for("update");
    if (!coupon || !coupon.active) return null;
    if (coupon.validUntil && coupon.validUntil <= now) return "expired";
    const [prev] = await tx
      .select()
      .from(couponVotes)
      .where(and(eq(couponVotes.couponId, couponId), eq(couponVotes.voterHash, voterHash)));
    if (prev?.worked === worked) return coupon;
    if (prev) {
      await tx.update(couponVotes).set({ worked, at: new Date() }).where(eq(couponVotes.id, prev.id));
    } else {
      await tx.insert(couponVotes).values({ couponId, voterHash, worked });
    }
    const next = {
      worked: coupon.worked + (worked ? 1 : prev ? -1 : 0),
      failed: coupon.failed + (worked ? (prev ? -1 : 0) : 1),
    };
    const [updated] = await tx.update(coupons).set(next).where(eq(coupons.id, couponId)).returning();
    return updated;
  });
}

export async function deactivateCoupon(db: Db, id: number, now = new Date()): Promise<boolean> {
  const res = await db
    .update(coupons)
    // a repeated deactivation keeps the first date, so the retention window is not restarted
    .set({ active: false, deactivatedAt: sql`coalesce(${coupons.deactivatedAt}, ${now.toISOString()}::timestamptz)` })
    .where(eq(coupons.id, id))
    .returning({ id: coupons.id });
  return res.length > 0;
}

export const CLICK_RETENTION_MONTHS = 12;
export const COUPON_VOTE_RETENTION_DAYS = 30;

/**
 * Retention policy (see /privacidade): clicks older than 12 months, and votes of coupons that have been
 * inactive (deactivated_at) or expired (valid_until) for more than 30 days, are deleted.
 */
export async function purgeExpiredData(db: Db, now: Date): Promise<{ clicks: number; couponVotes: number }> {
  const clickCutoff = new Date(now);
  clickCutoff.setUTCMonth(clickCutoff.getUTCMonth() - CLICK_RETENTION_MONTHS);
  const voteCutoff = new Date(now.getTime() - COUPON_VOTE_RETENTION_DAYS * 24 * 60 * 60e3);
  const deletedClicks = await db.delete(clicks).where(lt(clicks.at, clickCutoff)).returning({ id: clicks.id });
  const staleCoupons = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(or(and(eq(coupons.active, false), lt(coupons.deactivatedAt, voteCutoff)), lt(coupons.validUntil, voteCutoff)));
  const deletedVotes = await db
    .delete(couponVotes)
    .where(inArray(couponVotes.couponId, staleCoupons))
    .returning({ id: couponVotes.id });
  return { clicks: deletedClicks.length, couponVotes: deletedVotes.length };
}

export const PRODUCT_ORDERS = ["menor-preco", "maior-desconto", "recentes"] as const;
export type ProductOrder = (typeof PRODUCT_ORDERS)[number];

export interface ListProductsOptions {
  store?: StoreId;
  minCents?: number;
  maxCents?: number;
  order: ProductOrder;
  limit: number;
  offset: number;
}

export interface ListedProduct {
  productId: number;
  store: StoreId;
  title: string;
  imageUrl: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  shippingCents: number | null;
  pagamento: "app" | "pix" | null;
  observedAt: Date;
}

/**
 * Every tracked product with its latest observed price. Driven from products (store filter applied
 * there) with a LATERAL "latest observation" lookup that uses the (product_id, observed_at) index, so
 * price_observations is never scanned/sorted as a whole. Price filters and the "menor-preco" order use the
 * total (price + shipping when informed). `total` is the number of products matching the filters
 * (0 when the requested page is past the end).
 */
export async function listProducts(db: Db, o: ListProductsOptions): Promise<{ items: ListedProduct[]; total: number }> {
  const found = await rows<{
    id: number; store: StoreId; title: string; image_url: string | null; price_cents: number;
    original_price_cents: number | null; shipping_cents: number | null; attributes: Record<string, string>;
    observed_at: string | Date; total: number | string;
  }>(db, listProductsSql(o));
  return {
    total: found.length ? Number(found[0].total) : 0,
    items: found.map((r) => ({
      productId: Number(r.id),
      store: r.store,
      title: r.title,
      imageUrl: r.image_url,
      priceCents: Number(r.price_cents),
      originalPriceCents: r.original_price_cents === null ? null : Number(r.original_price_cents),
      shippingCents: r.shipping_cents === null ? null : Number(r.shipping_cents),
      pagamento: pagamentoOf(r.attributes ?? {}),
      observedAt: new Date(r.observed_at),
    })),
  };
}

/** Query behind listProducts (exported for EXPLAIN checks). */
export function listProductsSql(o: ListProductsOptions): SQL {
  const total = sql`(l.price_cents + coalesce(l.shipping_cents, 0))`;
  const orderBy =
    o.order === "maior-desconto"
      ? sql`case when l.original_price_cents > l.price_cents then (l.original_price_cents - l.price_cents)::float8 / l.original_price_cents end desc nulls last, ${total} asc, p.id asc`
      : o.order === "recentes"
        ? sql`l.observed_at desc, p.id desc`
        : sql`${total} asc, p.id asc`;
  return sql`select p.id, p.store, p.title, p.image_url, p.attributes, l.price_cents, l.original_price_cents,
               l.shipping_cents, l.observed_at, count(*) over() as total
        from products p
        join lateral (
          select price_cents, original_price_cents, shipping_cents, observed_at
          from price_observations
          where product_id = p.id
          order by observed_at desc, id desc
          limit 1
        ) l on true
        where true
          ${o.store ? sql`and p.store = ${o.store}` : sql``}
          ${o.minCents !== undefined ? sql`and ${total} >= ${o.minCents}` : sql``}
          ${o.maxCents !== undefined ? sql`and ${total} <= ${o.maxCents}` : sql``}
        order by ${orderBy}
        limit ${o.limit} offset ${o.offset}`;
}
