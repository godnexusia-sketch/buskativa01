import type { NormalizedQuery, StoreId, StoreStatus } from "@buskativa/core";
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
  },
  (t) => [uniqueIndex("products_store_external").on(t.store, t.externalId)],
);

export const priceObservations = pgTable(
  "price_observations",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id),
    priceCents: integer("price_cents").notNull(),
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
