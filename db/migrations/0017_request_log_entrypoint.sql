-- The request-log screen shows which door a request came through (REST key
-- or the web), and the log now records it. Nullable: rows written before this
-- column simply show nothing, which is the truth about them.
ALTER TABLE "request_log" ADD COLUMN IF NOT EXISTS "entrypoint" text;
