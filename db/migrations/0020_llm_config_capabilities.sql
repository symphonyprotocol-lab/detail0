-- What a model can do and what each kind of token costs. architecture.md 9.5.
--
-- `llm_config` priced two token kinds and described none of the model's
-- abilities. Both gaps show up in real operation: a cached prompt is billed at
-- a fraction of the base rate, so charging it at the base rate overstates
-- spend on exactly the workload the playground has (one fixed system prompt,
-- repeated); and a reasoning model is not interchangeable with a plain one,
-- because it takes an effort setting and bills for tokens nobody ever sees.
--
-- `max_input_tokens` is the model's context window, and the playground sizes
-- its retrieval budget from it rather than from a constant -- that constant
-- was 4000 for every model regardless of what it could actually hold.
--
-- `reasoning_effort` is nullable and meaningful only when
-- `supports_reasoning`; the application refuses the combination that says
-- otherwise, so the column cannot describe a model that has no such setting.
--
-- Defaults are chosen so existing rows keep behaving exactly as they did: no
-- declared abilities, no effort, cached tokens priced at zero (nothing was
-- measuring them before, so there is nothing to restate), and a context window
-- matching the retrieval budget the code used to hard-code.
ALTER TABLE "llm_config" ADD COLUMN IF NOT EXISTS "max_input_tokens" integer DEFAULT 8000 NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_config" ADD COLUMN IF NOT EXISTS "cache_price_micro" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_config" ADD COLUMN IF NOT EXISTS "supports_tools" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_config" ADD COLUMN IF NOT EXISTS "supports_reasoning" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_config" ADD COLUMN IF NOT EXISTS "supports_vision" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_config" ADD COLUMN IF NOT EXISTS "reasoning_effort" text;--> statement-breakpoint

-- The two token kinds the cost metric could not previously tell apart.
-- `prompt_tokens` keeps counting every input token, cached ones included, the
-- way every provider reports it; `cached_tokens` says how many of those were
-- reads, so the two prices can be applied without the total drifting.
-- `reasoning_tokens` is a breakdown of `completion_tokens`, not an addition to
-- it -- recorded because it is the part of a bill that has no visible output
-- to explain it.
ALTER TABLE "llm_cost_event" ADD COLUMN IF NOT EXISTS "cached_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_cost_event" ADD COLUMN IF NOT EXISTS "reasoning_tokens" integer DEFAULT 0 NOT NULL;
