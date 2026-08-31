-- The playground's LLM provider configuration, and what its calls cost.
-- architecture.md 9.5.
--
-- `llm_config` is console-configured and versioned like plans and policies:
-- immutable rows, the newest one active. The provider credential stays in the
-- environment (15.3) -- this table holds everything about the provider except
-- the secret: endpoint, model, output and timeout budgets, and unit prices in
-- micro-USD per million tokens, frozen per version so historical cost rows
-- keep meaning what they meant.
--
-- `llm_cost_event` is the append-only cost metric 9.5 allows the model tokens
-- to flow into: token counts and the computed cost, never the question or the
-- answer. The library is carried by public id without a foreign key, because
-- spend history must survive the library it was spent on.
CREATE TABLE IF NOT EXISTS "llm_config" (
  "id" uuid PRIMARY KEY NOT NULL,
  "base_url" text NOT NULL,
  "model" text NOT NULL,
  "max_output_tokens" integer NOT NULL,
  "timeout_ms" integer NOT NULL,
  "prompt_price_micro" bigint NOT NULL,
  "completion_price_micro" bigint NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_cost_event" (
  "id" uuid PRIMARY KEY NOT NULL,
  "config_id" uuid NOT NULL REFERENCES "llm_config"("id"),
  "library_public_id" text NOT NULL,
  "workspace_id" uuid,
  "model" text NOT NULL,
  "prompt_tokens" integer NOT NULL,
  "completion_tokens" integer NOT NULL,
  "cost_micro_usd" bigint NOT NULL,
  "latency_ms" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_cost_event_time_idx" ON "llm_cost_event" ("created_at");
