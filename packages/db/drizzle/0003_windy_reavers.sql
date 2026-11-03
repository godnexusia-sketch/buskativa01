CREATE TABLE "coupon_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"coupon_id" integer NOT NULL,
	"voter_hash" text NOT NULL,
	"worked" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"store" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"discount_type" text NOT NULL,
	"discount_value" integer NOT NULL,
	"min_order_cents" integer,
	"valid_until" timestamp with time zone,
	"source_url" text,
	"source" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"worked" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupon_votes" ADD CONSTRAINT "coupon_votes_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_votes_coupon_voter" ON "coupon_votes" USING btree ("coupon_id","voter_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_store_code" ON "coupons" USING btree ("store","code");