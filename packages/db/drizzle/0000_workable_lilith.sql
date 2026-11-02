CREATE TABLE "clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"referer" text
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"shipping_cents" integer,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"store" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"image_url" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seller_name" text,
	"seller_rating" real
);
--> statement-breakpoint
CREATE TABLE "queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"original" text NOT NULL,
	"normalized" jsonb NOT NULL,
	"hash" text NOT NULL,
	"watched" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queries_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "query_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"position" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"shipping_cents" integer
);
--> statement-breakpoint
CREATE TABLE "search_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"query_id" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"store_status" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_results" ADD CONSTRAINT "query_results_run_id_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_results" ADD CONSTRAINT "query_results_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_query_id_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."queries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_obs_product_time" ON "price_observations" USING btree ("product_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_external" ON "products" USING btree ("store","external_id");--> statement-breakpoint
CREATE INDEX "query_results_run" ON "query_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "query_results_product" ON "query_results" USING btree ("product_id");