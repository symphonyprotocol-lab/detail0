-- Indexes the platform-library console screens depend on.
--
-- `library` already carries an index on `(visibility, lifecycle_status)`, which
-- is the shape the public catalogue reads it in. The console reads it the other
-- way round: every query on these screens starts from `is_platform_library`,
-- and there are two or three orders of magnitude more user libraries than
-- platform ones, so without this the list is a sequential scan whose selectivity
-- gets worse the more successful the platform is.
--
-- Partial rather than a plain btree on the boolean: the false rows are the vast
-- majority and no query here ever wants them, so indexing them would be paying
-- for an entry per user library to answer questions about ours.
CREATE INDEX IF NOT EXISTS "library_platform_idx"
  ON "library" USING btree ("lifecycle_status", "created_at" DESC)
  WHERE "is_platform_library";--> statement-breakpoint
-- The detail screen and the list both count documents by version -- versions are
-- immutable, so counting by library would add every superseded build to a figure
-- that is meant to describe what is being served right now.
CREATE INDEX IF NOT EXISTS "document_version_idx" ON "document" USING btree ("version_id");--> statement-breakpoint
-- One version list per detail screen, newest first.
CREATE INDEX IF NOT EXISTS "library_version_library_idx"
  ON "library_version" USING btree ("library_id", "created_at" DESC);--> statement-breakpoint
-- `source` is read by library on every row of the list and on the detail screen;
-- the only index on it today is the primary key.
CREATE INDEX IF NOT EXISTS "source_library_idx" ON "source" USING btree ("library_id");--> statement-breakpoint
-- The refresh queue is read two ways: "is anything open for this library" before
-- queueing one, and "how deep is the queue" above the list.
CREATE INDEX IF NOT EXISTS "workflow_operation_library_idx"
  ON "workflow_operation" USING btree ("library_id", "operation_type", "status");--> statement-breakpoint
-- Retrieval calls per library, for the month figure above the list. Nothing
-- writes `usage_event` yet, so this indexes an empty table today -- which is the
-- cheapest moment to add it, and the figure it serves is a full scan without it.
CREATE INDEX IF NOT EXISTS "usage_event_library_time_idx"
  ON "usage_event" USING btree ("library_id","created_at");
