-- Library deletion. architecture.md 8.4, requirement.md 5.2.
--
-- A delete is two steps. The first, in the request, makes the library
-- unreachable: `deleted_at` is set, the lifecycle goes to `archived`, the
-- index to `deleting`, and the publication pointer is withdrawn. The second,
-- the Delete Workflow, removes the chunks, documents, profiles and objects.
-- The `library` row itself is never removed: `usage_event`, `earning_event`
-- and `settlement` reference it, and those are append-only facts.
--
-- The Library ID is released on deletion. The unique index becomes partial
-- over live rows, so a workspace that deletes `/owner/repo` can add it again
-- without being told a tombstone already holds the id. Every lookup by
-- `public_id` filters on `deleted_at is null`, so a live library and a
-- tombstone sharing an id never collide in a read either.
ALTER TABLE "library" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
DROP INDEX IF EXISTS "library_public_id_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_public_id_uq" ON "library" USING btree ("public_id") WHERE "deleted_at" IS NULL;
