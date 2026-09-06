-- A challenge proving a workspace controls a host, met before a website,
-- llms.txt or OpenAPI library may be created from it (requirement.md 7.3.2,
-- architecture.md 5.4). Only the token's hash is kept; the plaintext is
-- returned once, to the wizard that started the challenge, and comes back
-- with every check. A verified row is spent on exactly one library
-- (`consumed_library_id`) and is not a standing credential.
CREATE TABLE IF NOT EXISTS "domain_verification" (
  "id" uuid PRIMARY KEY,
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id"),
  "host" text NOT NULL,
  "method" "claim_method" NOT NULL,
  "challenge_token_hash" text NOT NULL,
  "status" "claim_status" NOT NULL,
  "failure_reason" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp with time zone NOT NULL,
  "verified_at" timestamp with time zone,
  "consumed_library_id" uuid REFERENCES "library"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_verification_workspace_idx" ON "domain_verification" ("workspace_id", "created_at");
