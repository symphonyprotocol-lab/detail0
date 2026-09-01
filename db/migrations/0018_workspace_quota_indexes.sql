-- Indexes the per-request quota transaction depends on.
--
-- Every request's quota check filters `subscription`, `addon_grant` and
-- `usage_reservation` by workspace inside one transaction, and none of the
-- three had an index on that column, so each check was three sequential
-- scans of tables that grow with the whole platform's traffic.
--
-- `publisher_account` is unique rather than plain: the application
-- check-then-inserts assuming one account per workspace, and only a
-- constraint makes that assumption true under concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS "publisher_account_workspace_uq" ON "publisher_account" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_workspace_idx" ON "subscription" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "addon_grant_workspace_idx" ON "addon_grant" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_reservation_workspace_idx" ON "usage_reservation" USING btree ("workspace_id");
