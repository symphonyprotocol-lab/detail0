-- Administrator credentials, lockout state and console sessions.
--
-- The console is a separate authority from the product (requirement.md 3.2):
-- its own credential store, its own second factor and its own session table,
-- so a product session can never be presented as an administrative one.
ALTER TABLE "administrator" ADD COLUMN IF NOT EXISTS "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "administrator" ADD COLUMN IF NOT EXISTS "failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "administrator" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "administrator" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "administrator_email_uq" ON "administrator" USING btree ("email");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"administrator_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"client_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_administrator_id_administrator_id_fk"
		FOREIGN KEY ("administrator_id") REFERENCES "public"."administrator"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_session_token_hash_uq" ON "admin_session" USING btree ("token_hash");--> statement-breakpoint
-- The preset roles of requirement.md 3.1. Capability rows are the server-side
-- copy of lib/domain/admin.ts; that module stays the source the console reads.
INSERT INTO "admin_role" ("id", "name") VALUES
	('super', 'Super administrator'),
	('operator', 'Operations administrator'),
	('reviewer', 'Content reviewer'),
	('support', 'Support agent')
ON CONFLICT ("id") DO NOTHING;
