-- Inviting an administrator, per requirement.md 5.3.
--
-- An invitation creates the row before anyone has chosen a credential for it,
-- so `password_hash` becomes nullable: a placeholder hash would be a credential
-- that exists but nobody picked, and sign-in has to refuse it explicitly rather
-- than rely on nobody guessing it. The enrolment secret is stored as a keyed
-- digest, single use, and expires -- a forgotten invitation must stop being a
-- way in.
ALTER TABLE "administrator" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "administrator" ADD COLUMN IF NOT EXISTS "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "administrator" ADD COLUMN IF NOT EXISTS "invite_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "administrator" ADD COLUMN IF NOT EXISTS "invited_by" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "administrator_invite_token_uq" ON "administrator" USING btree ("invite_token_hash");
