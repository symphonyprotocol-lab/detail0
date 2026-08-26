-- Indexes the registered-user console screens depend on.
--
-- Every one of these columns was already being filtered on; none of them had an
-- index, because until the console read them the only lookups were by primary
-- key or by token hash. The user list now counts live sessions and API keys per
-- row, and the user detail screen reads that account's audit history, so these
-- turn per-row sequential scans into lookups.
--
-- `user_session` and `api_key` grow with the whole platform's traffic rather
-- than with the number of accounts, which is why their scans are the ones that
-- get expensive first.
CREATE INDEX IF NOT EXISTS "user_session_user_idx" ON "user_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_workspace_idx" ON "api_key" USING btree ("workspace_id");--> statement-breakpoint
-- The primary key is (workspace_id, user_id), so a lookup by member cannot use
-- it: the leading column is the one that is not in the predicate.
CREATE INDEX IF NOT EXISTS "workspace_member_user_idx" ON "workspace_member" USING btree ("user_id");--> statement-breakpoint
-- Ordered by `seq` descending because that is how the audit history is read:
-- newest first, a page at a time, for one target.
CREATE INDEX IF NOT EXISTS "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id","seq" DESC);
