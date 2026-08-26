-- Two gaps found reviewing 0003.
--
-- 1. A TOTP code stayed usable for its whole validity window, so an observed
--    code could be replayed within ~90 seconds. `mfa_last_counter` records the
--    step a successful sign-in spent; anything at or below it is refused
--    (RFC 6238 5.2).
-- 2. `audit_log` had no unambiguous ordering. Finding the chain head by
--    `created_at` alone can tie, and random uuids give no tie-break, so two
--    concurrent writers could adopt the same `prev_hash` and fork the chain.
--    `seq` makes insertion order explicit; the writer also takes an advisory
--    lock so head-read and insert are one critical section (architecture.md 14).
ALTER TABLE "administrator" ADD COLUMN IF NOT EXISTS "mfa_last_counter" bigint;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "seq" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_seq_idx" ON "audit_log" USING btree ("seq" DESC);
