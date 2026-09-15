-- Per-source snapshot cache. A version records what each source contributed
-- (digest, bytes, scoring facts) so the next build can carry an unchanged
-- source's documents and chunks forward instead of parsing and embedding them
-- again; documents remember their source so they can be carried; a refresh
-- operation may name one source to fetch while the others are carried
-- forward unfetched. All nullable: rows written before this are "rebuild all".
ALTER TABLE "library_version" ADD COLUMN IF NOT EXISTS "source_digests" jsonb;
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "source_id" uuid;
ALTER TABLE "workflow_operation" ADD COLUMN IF NOT EXISTS "source_id" uuid;
