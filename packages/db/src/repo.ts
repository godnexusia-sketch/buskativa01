import { toCents, type NormalizedQuery, type Offer, type PricePoint, type StoreId, type StoreStatus } from "@buskativa/core";
import { and, desc, eq, gte, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "./client";
import { clicks, priceObservations, products, queries, queryResults, searchRuns } from "./schema";

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
    await db.insert(priceObservations).values({ productId: p.id, priceCents, shippingCents, observedAt });
    await db.insert(queryResults).values({ runId, productId: p.id, position, priceCents, shippingCents });
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
      shippingCents: queryResults.shippingCents,
    })
    .from(queryResults)
    .innerJoin(products, eq(products.id, queryResults.productId))
    .where(eq(queryResults.runId, runId))
    .orderBy(sql`${queryResults.priceCents} + coalesce(${queryResults.shippingCents}, 0)`);
  return { ...run, results };
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
