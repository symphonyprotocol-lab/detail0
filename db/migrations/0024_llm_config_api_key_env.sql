-- Which environment variable holds each model entry's key. architecture.md 15.3.
--
-- The adapter read one variable, LLM_PROVIDER_API_KEY, for every entry --
-- fine while every entry was one provider, wrong the day a second provider
-- is configured beside it. The secret stays where 15.3 keeps it, in the
-- environment; the entry only says which variable to read. Existing rows
-- name the variable they were always read from.
ALTER TABLE "llm_config" ADD COLUMN IF NOT EXISTS "api_key_env" text DEFAULT 'LLM_PROVIDER_API_KEY' NOT NULL;
