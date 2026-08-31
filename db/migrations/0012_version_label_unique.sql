-- A version label has to identify one build.
--
-- The label is `YYYYMMDD-<digest8>`, which was unique while a new version could
-- only come from a changed source. It no longer can: a build now rebuilds an
-- unchanged source when the parser, chunker, embedding model or search
-- configuration moved, so the same digest can be built twice on the same day.
-- The console's version list shows the label, and two identical rows there are
-- two rows an operator cannot choose between.
--
-- The update below renumbers any duplicate that already exists; on a deployment
-- where rebuilds were not yet possible it matches nothing. The index is what
-- makes the guarantee real rather than merely intended.
UPDATE "library_version" v
SET "label" = v."label" || '.' || d.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY library_id, label ORDER BY created_at) AS rn
  FROM "library_version"
) d
WHERE d.id = v.id AND d.rn > 1;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "library_version_label_uq"
  ON "library_version" ("library_id", "label");
