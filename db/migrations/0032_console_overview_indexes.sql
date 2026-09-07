-- The console's operations overview reads two append-only tables by time
-- alone -- requests in the last day, operations finished in the last day --
-- and neither had an index that leads with time.
CREATE INDEX IF NOT EXISTS "request_log_time_idx" ON "request_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_operation_updated_idx" ON "workflow_operation" USING btree ("updated_at");
