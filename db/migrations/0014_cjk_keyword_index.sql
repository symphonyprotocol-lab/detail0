-- Keyword retrieval for CJK content. architecture.md 22, closing the gap
-- migration 0011 recorded: stock Postgres cannot segment Han text, so under
-- `simple` an entire run becomes one token and Chinese libraries answer
-- keyword queries with nothing -- only the vector half carried them.
--
-- Segmentation now happens in the application before Postgres sees the text
-- (lib/domain/cjk.ts): Han runs become overlapping bigrams, stored
-- space-joined in `body_segmented`, and `to_tsvector('simple', ...)` over that
-- pre-segmented form is a correct index. A stored column plus a generated
-- vector, in that order, because the generation expression must stay
-- IMMUTABLE and Postgres has no segmenter to call.
--
-- Existing CJK rows keep a null `body_segmented`: chunks are immutable, and
-- the column rides the same rebuild discipline as every other derived value --
-- the next build of an affected library writes it. A dictionary segmenter
-- (zhparser) stays the upgrade path and would arrive the same way.
ALTER TABLE "chunk" ADD COLUMN IF NOT EXISTS "body_segmented" text;--> statement-breakpoint
ALTER TABLE "chunk" ADD COLUMN IF NOT EXISTS "search_vector_cjk" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("body_segmented", ''))) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chunk_search_vector_cjk_idx" ON "chunk" USING gin ("search_vector_cjk");
