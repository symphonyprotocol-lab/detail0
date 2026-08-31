-- What `embed-index` (architecture.md 8.2, step 7) writes, and what reads it.
--
-- `chunk.search_vector` was declared `text`, which is a column named after a
-- full-text index rather than one. architecture.md 1.2 and 8.3 put the keyword
-- index *on the chunk row* precisely so that publishing is one transaction: if
-- the vector were a separate structure, "index written, pointer not switched"
-- would be a reachable state. A `text` column cannot be queried with `@@`, so
-- until now that guarantee had nothing behind it.
--
-- Generated rather than written by the application. A stored generated column
-- cannot drift from `body` -- there is no code path that updates one without
-- the other, because there is no code path that writes it at all. Chunks are
-- immutable once inserted (requirement.md 8.1 freezes a published Version), so
-- the generation cost is paid once per chunk and never on update.
--
-- `simple` rather than `english`: a library may hold documentation in any
-- language, and an English stemmer applied to Chinese or German text discards
-- tokens without improving recall. Language-aware configurations belong with
-- per-library language detection, which is a retrieval concern, not this one.
ALTER TABLE "chunk" DROP COLUMN IF EXISTS "search_vector";--> statement-breakpoint
ALTER TABLE "chunk" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', "body")) STORED;--> statement-breakpoint

-- The keyword half of hybrid retrieval. GIN is the index type `tsvector @@
-- tsquery` can use; without it the "index" is a sequential scan over every
-- chunk of every library.
CREATE INDEX IF NOT EXISTS "chunk_search_vector_idx"
  ON "chunk" USING gin ("search_vector");--> statement-breakpoint

-- One chunk per position per document per version.
--
-- This is what makes a rebuild safe to retry. architecture.md 8.2 requires
-- every step to be idempotent, and a build that failed after writing half its
-- chunks must be able to write them again without producing two copies of the
-- same position -- which retrieval would then return twice, with the same
-- citation, as if two sources agreed.
CREATE UNIQUE INDEX IF NOT EXISTS "chunk_position_uq"
  ON "chunk" ("version_id", "document_id", "ordinal");--> statement-breakpoint

-- The queue drain: oldest pending operation first.
--
-- Partial, because the worker only ever asks for pending rows and finished
-- operations are kept indefinitely as history. Indexing the finished ones would
-- grow the index with every build ever run to answer a question that is only
-- ever about the few that have not run yet.
CREATE INDEX IF NOT EXISTS "workflow_operation_pending_idx"
  ON "workflow_operation" ("created_at")
  WHERE "status" = 'pending';--> statement-breakpoint

-- Scores are appended per build, never updated, so the current score is the
-- newest row rather than the only row. requirement.md 6.3 requires the UI to
-- show when a score was computed, which only means something if the history is
-- kept.
CREATE INDEX IF NOT EXISTS "library_score_current_idx"
  ON "library_score" ("library_id", "computed_at" DESC);
