-- The request-log screen shows what each request returned and which key made
-- it (requirement.md 5.2). Both nullable: rows written before this migration
-- simply show nothing, which is the truth about them. `api_key_id` carries no
-- foreign key, as `library_public_id` does not: the log must outlive what it
-- names.
ALTER TABLE "request_log" ADD COLUMN IF NOT EXISTS "returned_tokens" integer;
ALTER TABLE "request_log" ADD COLUMN IF NOT EXISTS "api_key_id" uuid;
