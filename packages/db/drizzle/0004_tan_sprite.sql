ALTER TABLE "coupons" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
-- cupons já inativos antes desta migração começam a contar os 30 dias agora
UPDATE "coupons" SET "deactivated_at" = now() WHERE "active" = false;