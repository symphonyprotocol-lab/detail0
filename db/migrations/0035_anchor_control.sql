-- Pausing anchoring, as an append-only record rather than a switch.
--
-- Same shape as retrieval_config: rows are never updated, the newest one is in
-- force, and the history of who paused what and why is the table itself. A
-- boolean somewhere that an operator can flip back and forth leaves no trace of
-- the window it was off for, which is exactly the window someone would ask
-- about afterwards.
--
-- Pausing stops planning and submitting. It deliberately does not stop
-- confirming: a batch already on its way has to be finished, or a pause strands
-- a transaction the chain has already accepted.
CREATE TABLE IF NOT EXISTS "anchor_control" (
  "id" uuid PRIMARY KEY,
  "paused" boolean NOT NULL,
  "reason" text NOT NULL,
  "administrator_id" uuid REFERENCES "administrator"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "anchor_control_time_idx" ON "anchor_control" ("created_at" DESC);
