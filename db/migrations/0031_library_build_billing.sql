-- Library builds billed in API Calls. library-build-billing.md 5.
--
-- A build is priced from what it added -- fresh tokens embedded, pages
-- fetched -- at rates frozen on the caller's Plan Version, and debited from
-- the same pool retrieval draws on. The ledger stays one table: a usage event
-- now carries a weight (`calls`), which is 1 for every retrieval event ever
-- written and the priced figure for a build. Reservations carry the same
-- weight, and a `kind` so the fifteen-minute sweep for abandoned retrieval
-- seats leaves a long build's seat alone.
ALTER TABLE "plan_version" ADD COLUMN IF NOT EXISTS "build_base_calls" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "plan_version" ADD COLUMN IF NOT EXISTS "build_tokens_per_call" integer NOT NULL DEFAULT 20000;--> statement-breakpoint
ALTER TABLE "plan_version" ADD COLUMN IF NOT EXISTS "build_pages_per_call" integer NOT NULL DEFAULT 5;--> statement-breakpoint
-- The pack grants calls and no rates: its columns carry the same 0 sentinel
-- as its ceilings (`PACK_INHERITS_PRO`), never a number that reads as a rate.
UPDATE "plan_version"
SET "build_base_calls" = 0, "build_tokens_per_call" = 0, "build_pages_per_call" = 0
WHERE "plan_id" = 'addon';--> statement-breakpoint
ALTER TABLE "usage_reservation" ADD COLUMN IF NOT EXISTS "calls" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "usage_reservation" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'retrieval';--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN IF NOT EXISTS "calls" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN IF NOT EXISTS "build_detail" jsonb;--> statement-breakpoint
ALTER TABLE "usage_summary" ADD COLUMN IF NOT EXISTS "build_calls" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "workflow_operation" ADD COLUMN IF NOT EXISTS "reservation_id" uuid REFERENCES "usage_reservation"("id");--> statement-breakpoint
ALTER TABLE "workflow_operation" ADD COLUMN IF NOT EXISTS "quoted_calls" integer;--> statement-breakpoint
ALTER TABLE "workflow_operation" ADD COLUMN IF NOT EXISTS "charged_calls" integer;--> statement-breakpoint
-- The library page reads "what did this version cost" by version.
CREATE INDEX IF NOT EXISTS "usage_event_version_idx" ON "usage_event" USING btree ("version_id") WHERE "entrypoint" = 'build';
