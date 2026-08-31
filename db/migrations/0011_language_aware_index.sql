-- Index each library's chunks in its own language. requirement.md 6.1, 6.3.
--
-- `search_vector` was built with `simple` for everything: no stemming, so
-- `promise` and `promises` are different tokens and an English documentation
-- set answers half the queries it should. The configuration that should be used
-- is a property of the library (`library.language`), and this is how a chunk
-- gets to know it.
--
-- Denormalized onto the chunk rather than joined at index time, for two
-- reasons. A generated column may only read its own row, so a join is not
-- available at all. And editing `library.language` afterwards must not silently
-- restate what an already published Version means -- chunks are immutable
-- (requirement.md 8.1), the new language takes effect on the next build, and
-- until then this column is an accurate record of how the existing rows were
-- actually indexed.
--
-- A `CASE` over literal configurations rather than `search_config::regconfig`:
-- the cast performs a catalogue lookup, which makes it STABLE rather than
-- IMMUTABLE, and Postgres refuses it in a generated column outright. The
-- branches below are therefore the whole vocabulary, and `chunk_search_config_ck`
-- makes it impossible to store a value that has no branch -- which would
-- generate a NULL vector, and a chunk that exists and can never be found.
--
-- Stock Postgres ships no Chinese, Japanese or Korean configuration; those need
-- a segmenter extension a managed Postgres will not install. CJK text keeps
-- `simple`, which does not segment -- an entire run of Han characters becomes a
-- single token -- so keyword retrieval stays unavailable for those libraries and
-- the vector half carries them. That is a real gap, recorded here rather than
-- papered over by assigning them a European stemmer.
ALTER TABLE "chunk" ADD COLUMN IF NOT EXISTS "search_config" text NOT NULL DEFAULT 'simple';--> statement-breakpoint

ALTER TABLE "chunk" DROP CONSTRAINT IF EXISTS "chunk_search_config_ck";--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_search_config_ck"
  CHECK ("search_config" IN ('simple', 'arabic', 'armenian', 'basque', 'catalan', 'danish', 'dutch', 'english', 'finnish', 'french', 'german', 'greek', 'hindi', 'hungarian', 'indonesian', 'irish', 'italian', 'lithuanian', 'nepali', 'norwegian', 'portuguese', 'romanian', 'russian', 'serbian', 'spanish', 'swedish', 'tamil', 'turkish', 'yiddish'));--> statement-breakpoint

-- Dropping the column drops `chunk_search_vector_idx` with it, so both are
-- rebuilt here. Every existing chunk is re-tokenized in the process: cheap
-- while the table is small, and worth doing before it is not.
ALTER TABLE "chunk" DROP COLUMN IF EXISTS "search_vector";--> statement-breakpoint
ALTER TABLE "chunk" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    CASE "search_config"
      WHEN 'arabic' THEN to_tsvector('arabic', "body")
      WHEN 'armenian' THEN to_tsvector('armenian', "body")
      WHEN 'basque' THEN to_tsvector('basque', "body")
      WHEN 'catalan' THEN to_tsvector('catalan', "body")
      WHEN 'danish' THEN to_tsvector('danish', "body")
      WHEN 'dutch' THEN to_tsvector('dutch', "body")
      WHEN 'english' THEN to_tsvector('english', "body")
      WHEN 'finnish' THEN to_tsvector('finnish', "body")
      WHEN 'french' THEN to_tsvector('french', "body")
      WHEN 'german' THEN to_tsvector('german', "body")
      WHEN 'greek' THEN to_tsvector('greek', "body")
      WHEN 'hindi' THEN to_tsvector('hindi', "body")
      WHEN 'hungarian' THEN to_tsvector('hungarian', "body")
      WHEN 'indonesian' THEN to_tsvector('indonesian', "body")
      WHEN 'irish' THEN to_tsvector('irish', "body")
      WHEN 'italian' THEN to_tsvector('italian', "body")
      WHEN 'lithuanian' THEN to_tsvector('lithuanian', "body")
      WHEN 'nepali' THEN to_tsvector('nepali', "body")
      WHEN 'norwegian' THEN to_tsvector('norwegian', "body")
      WHEN 'portuguese' THEN to_tsvector('portuguese', "body")
      WHEN 'romanian' THEN to_tsvector('romanian', "body")
      WHEN 'russian' THEN to_tsvector('russian', "body")
      WHEN 'serbian' THEN to_tsvector('serbian', "body")
      WHEN 'spanish' THEN to_tsvector('spanish', "body")
      WHEN 'swedish' THEN to_tsvector('swedish', "body")
      WHEN 'tamil' THEN to_tsvector('tamil', "body")
      WHEN 'turkish' THEN to_tsvector('turkish', "body")
      WHEN 'yiddish' THEN to_tsvector('yiddish', "body")
      ELSE to_tsvector('simple', "body")
    END
  ) STORED;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chunk_search_vector_idx"
  ON "chunk" USING gin ("search_vector");
--> statement-breakpoint

-- A Version records how it was built, so that a build can tell whether the
-- current one is still what today's code and configuration would produce.
--
-- requirement.md 8.1 already freezes the parser, chunker and embedding model on
-- the version for exactly this reason; the text-search configuration is the
-- fourth thing that decides what a version *is*, and leaving it off would mean
-- an operator correcting a library's language sees the next refresh skip as
-- "unchanged" and nothing happen.
ALTER TABLE "library_version" ADD COLUMN IF NOT EXISTS "search_config" text NOT NULL DEFAULT 'simple';
