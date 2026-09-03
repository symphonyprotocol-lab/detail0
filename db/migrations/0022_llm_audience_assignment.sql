-- Which model answers which callers. architecture.md 9.5.
--
-- `llm_config` is the registry: what models exist, with their budgets and
-- frozen prices. Which of them the playground calls used to be a flag on the
-- entry (`is_default`), which meant "the default" was a property of a model
-- rather than a decision about callers. The product wants two decisions --
-- the model the platform spends on a visitor who has paid nothing
-- (anonymous, or a workspace on the free plan), and the model a paid
-- subscription buys -- so they live in their own table, append-only like
-- every configuration here: the newest row is the assignment in force, and
-- each row names entries by slug.
--
-- A null `trial_slug` means the newest enabled entry (a one-model install
-- works with no ceremony); a null `subscriber_slug` means subscribers are
-- answered by the trial model. `is_default` is dropped: an assignment row
-- says everything it said.
CREATE TABLE IF NOT EXISTS "llm_audience_assignment" (
  "id" uuid PRIMARY KEY,
  "trial_slug" text,
  "subscriber_slug" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_audience_assignment_time_idx" ON "llm_audience_assignment" USING btree ("created_at" DESC);--> statement-breakpoint

-- Carry the old flag over as the first assignment, so an installation keeps
-- answering with the model it answered with.
INSERT INTO "llm_audience_assignment" ("id", "trial_slug", "subscriber_slug")
SELECT gen_random_uuid(), c."slug", NULL
FROM (
  SELECT DISTINCT ON ("slug") "slug", "is_default", "created_at"
  FROM "llm_config" ORDER BY "slug", "created_at" DESC
) c
WHERE c."is_default" ORDER BY c."created_at" DESC LIMIT 1;--> statement-breakpoint

ALTER TABLE "llm_config" DROP COLUMN IF EXISTS "is_default";--> statement-breakpoint
ALTER TABLE "llm_config" DROP COLUMN IF EXISTS "audience";
