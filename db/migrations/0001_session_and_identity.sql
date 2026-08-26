ALTER TABLE "oauth_account" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_session" ADD COLUMN "token_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user_session" ADD COLUMN "client_summary" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_session" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "kind" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_session_token_hash_uq" ON "user_session" USING btree ("token_hash");