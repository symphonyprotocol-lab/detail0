-- Several selectable models instead of one. architecture.md 9.5.
--
-- `llm_config` was a single version chain: the newest row was the
-- configuration, full stop. The console now keeps a set of models and the
-- playground picks one, so a row needs to say which model entry it belongs
-- to. `slug` is that identity -- stable across edits, because editing still
-- mints a successor row rather than mutating one. The active set is therefore
-- "the newest row per slug", and each of those rows carries its own budgets
-- and frozen unit prices, which is what keeps historical cost events
-- meaningful after a price change.
--
-- `is_default` marks the entry the playground uses when the caller names no
-- model. Setting a default mints a row, so an entry that used to be the
-- default keeps a stale `true` on its newest row; resolution is therefore
-- "newest row per slug, is_default true, most recent wins". That ordering is
-- deterministic and costs nothing, and it is the price of not rewriting rows
-- that other tables' history depends on.
--
-- Backfill: every existing row is the history of one model, so they all take
-- the same slug, and the newest becomes the default.
ALTER TABLE "llm_config" ADD COLUMN IF NOT EXISTS "slug" text;--> statement-breakpoint
ALTER TABLE "llm_config" ADD COLUMN IF NOT EXISTS "label" text;--> statement-breakpoint
ALTER TABLE "llm_config" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint

UPDATE "llm_config" SET "slug" = 'default' WHERE "slug" IS NULL;--> statement-breakpoint
UPDATE "llm_config" SET "label" = "model" WHERE "label" IS NULL;--> statement-breakpoint
UPDATE "llm_config" SET "is_default" = true
  WHERE "id" = (SELECT "id" FROM "llm_config" ORDER BY "created_at" DESC LIMIT 1);--> statement-breakpoint

ALTER TABLE "llm_config" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_config" ALTER COLUMN "label" SET NOT NULL;--> statement-breakpoint

-- Resolving the active set reads the newest row per slug on every playground
-- request, which is exactly this index.
CREATE INDEX IF NOT EXISTS "llm_config_slug_time_idx" ON "llm_config" USING btree ("slug", "created_at" DESC);
