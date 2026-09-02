-- Retrieval's tunables, as console configuration. architecture.md 9.2, 9.6.
--
-- Recall widths, the fusion constant, the rerank window, the public-result
-- cache TTL, the playground's excerpt budgets and the library-routing limits
-- were constants in code. They are rows now, append-only like `llm_config`:
-- a save mints a new row, the newest row is the configuration in force, and
-- the history is the record of what retrieval was doing when. No backfill --
-- an empty table means the code defaults, which are the old constants, so
-- nothing changes until an operator saves.
--
-- Read on every retrieval request (newest row), which is what the index is
-- for. The row's id joins every public cache key, so a change retires the
-- cache without a flush.
CREATE TABLE IF NOT EXISTS "retrieval_config" (
  "id" uuid PRIMARY KEY NOT NULL,
  "recall_limit" integer NOT NULL,
  "rrf_k" integer NOT NULL,
  "rerank_window" integer NOT NULL,
  "rerank_document_chars" integer NOT NULL,
  "cache_ttl_seconds" integer NOT NULL,
  "playground_tokens_default" integer NOT NULL,
  "playground_tokens_max" integer NOT NULL,
  "routing_recall_limit" integer NOT NULL,
  "routing_rare_sample_cap" integer NOT NULL,
  "routing_result_limit" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "retrieval_config_time_idx" ON "retrieval_config" USING btree ("created_at" DESC);
