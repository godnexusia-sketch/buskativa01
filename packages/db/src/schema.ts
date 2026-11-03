import type { CategoryId, CouponSource, DiscountType, NormalizedQuery, StoreId, StoreStatus } from "@buskativa/core";
import {
  boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const queries = pgTable("queries", {
  id: serial("id").primaryKey(),
  original: text("original").notNull(),
  normalized: jsonb("normalized").$type<NormalizedQuery>().notNull(),
  hash: text("hash").notNull().unique(),
  watched: boolean("watched").notNull().default(true),
  lastRunAt: tz("last_run_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    store: text("store").$type<StoreId>().notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    imageUrl: text("image_url"),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    sellerName: text("seller_name"),
    sellerRating: real("seller_rating"),
    // guessed from the title (core categorize); null only on rows saved before the column existed
    category: text("category").$type<CategoryId>(),
  },
  (t) => [uniqueIndex("products_store_external").on(t.store, t.externalId), index("products_category").on(t.category)],
);

export const priceObservations = pgTable(
  "price_observations",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id),
    priceCents: integer("price_cents").notNull(),
    originalPriceCents: integer("original_price_cents"),
    shippingCents: integer("shipping_cents"),
    observedAt: tz("observed_at").notNull().defaultNow(),
  },
  (t) => [
    index("price_obs_product_time").on(t.productId, t.observedAt),
    // topDrops filters recent observations across all products by time
    index("price_obs_time").on(t.observedAt),
  ],
);

export const searchRuns = pgTable("search_runs", {
  id: serial("id").primaryKey(),
  queryId: integer("query_id").notNull().references(() => queries.id),
  status: text("status").$type<"running" | "done">().notNull().default("running"),
  storeStatus: jsonb("store_status").$type<Partial<Record<StoreId, StoreStatus>>>().notNull().default({}),
  startedAt: tz("started_at").notNull().defaultNow(),
  finishedAt: tz("finished_at"),
});

export const queryResults = pgTable(
  "query_results",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => searchRuns.id),
    productId: integer("product_id").notNull().references(() => products.id),
    position: integer("position").notNull(),
    priceCents: integer("price_cents").notNull(),
    originalPriceCents: integer("original_price_cents"),
    shippingCents: integer("shipping_cents"),
  },
  (t) => [index("query_results_run").on(t.runId), index("query_results_product").on(t.productId)],
);

export const clicks = pgTable("clicks", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  at: tz("at").notNull().defaultNow(),
  referer: text("referer"),
});

export const coupons = pgTable(
  "coupons",
  {
    id: serial("id").primaryKey(),
    store: text("store").$type<StoreId>().notNull(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    discountType: text("discount_type").$type<DiscountType>().notNull(),
    discountValue: integer("discount_value").notNull(),
    minOrderCents: integer("min_order_cents"),
    validUntil: tz("valid_until"),
    sourceUrl: text("source_url"),
    source: text("source").$type<CouponSource>().notNull(),
    active: boolean("active").notNull().default(true),
    // set when the coupon goes inactive; drives the 30-day vote retention purge
    deactivatedAt: tz("deactivated_at"),
    worked: integer("worked").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coupons_store_code").on(t.store, t.code)],
);

export const couponVotes = pgTable(
  "coupon_votes",
  {
    id: serial("id").primaryKey(),
    couponId: integer("coupon_id").notNull().references(() => coupons.id),
    voterHash: text("voter_hash").notNull(),
    worked: boolean("worked").notNull(),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coupon_votes_coupon_voter").on(t.couponId, t.voterHash)],
);
