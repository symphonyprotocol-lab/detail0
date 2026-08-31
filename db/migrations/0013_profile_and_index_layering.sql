-- Index layering for scale, and the library profile. architecture.md 9.1, 9.6.
--
-- The global HNSW over `chunk.embedding` goes. Retrieval always pins one
-- version before any recall, so vector search is an exact scan of that
-- version's few thousand rows -- full recall, no graph. What the global index
-- actually bought was three liabilities at hundred-thousand-library scale:
-- filtered recall collapse (the graph's neighbours are almost never the target
-- library's), an index that cannot fit in memory, and graph maintenance on
-- every ingestion insert -- the last one being a direct tax on concurrent
-- builds. Dropping it makes chunk inserts plain heap-and-btree writes.
DROP INDEX IF EXISTS "chunk_embedding_hnsw_idx";--> statement-breakpoint

-- One profile row per built version: the content-derived identity a library is
-- routed by, since the display name on a UGC platform says nothing about what
-- is inside. `search_text` arrives pre-segmented (the domain extractor splits
-- CJK into n-grams before Postgres sees it), so `simple` is correct here even
-- though it cannot segment chunk bodies.
CREATE TABLE IF NOT EXISTS "library_profile" (
  "id" uuid PRIMARY KEY NOT NULL,
  "library_id" uuid NOT NULL REFERENCES "library"("id"),
  "version_id" uuid NOT NULL REFERENCES "library_version"("id"),
  "profile_version" text NOT NULL,
  "document_titles" jsonb NOT NULL,
  "terms" jsonb NOT NULL,
  "search_text" text NOT NULL,
  "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "search_text")) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_profile_version_uq" ON "library_profile" ("version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_profile_library_idx" ON "library_profile" ("library_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_profile_search_idx" ON "library_profile" USING gin ("search_vector");--> statement-breakpoint

-- The picture-layer vectors: chunk-embedding centroids, a handful per library.
-- This is the one table where a global HNSW is affordable and correct -- its
-- row count is libraries x centroids, not chunks.
CREATE TABLE IF NOT EXISTS "library_profile_vector" (
  "id" uuid PRIMARY KEY NOT NULL,
  "library_id" uuid NOT NULL REFERENCES "library"("id"),
  "version_id" uuid NOT NULL REFERENCES "library_version"("id"),
  "ordinal" integer NOT NULL,
  "embedding" vector(1536) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_profile_vector_uq" ON "library_profile_vector" ("version_id", "ordinal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_profile_vector_library_idx" ON "library_profile_vector" ("library_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_profile_vector_hnsw_idx" ON "library_profile_vector" USING hnsw ("embedding" vector_cosine_ops);
