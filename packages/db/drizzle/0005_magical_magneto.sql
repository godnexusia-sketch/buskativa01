ALTER TABLE "products" ADD COLUMN "category" text;--> statement-breakpoint
CREATE INDEX "products_category" ON "products" USING btree ("category");