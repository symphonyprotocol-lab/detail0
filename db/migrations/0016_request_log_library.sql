-- The request log grows the column its screen needs and the index its reads
-- use. architecture.md 6.3: a user-facing summary of each request -- which
-- library, what outcome, how long -- and never the query text (17.1). The
-- library rides as a public id without a foreign key: request history must
-- survive the library it touched, exactly like the LLM cost events.
ALTER TABLE "request_log" ADD COLUMN IF NOT EXISTS "library_public_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_log_workspace_time_idx" ON "request_log" ("workspace_id", "created_at");
