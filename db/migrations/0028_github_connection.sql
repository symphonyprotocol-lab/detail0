-- A person's GitHub account, connected for repository imports.
--
-- Login drops the provider token (requirement.md 12); this is the separate,
-- consented grant that lets the wizard list the account's own public
-- repositories and lets the create use case prove the chosen repository is
-- theirs. The token is sealed (AES-GCM, key derived from the session secret)
-- before it is written and kept in its own table, apart from business rows
-- (requirement.md 12: "OAuth/Notion/GitHub Token 加密保存，并与普通业务数据分离").
-- One connection per user; reconnecting replaces the token.
CREATE TABLE IF NOT EXISTS "github_connection" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "user"("id"),
  "github_user_id" text NOT NULL,
  "login" text NOT NULL,
  "token_sealed" text NOT NULL,
  "scope" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_connection_user_uq" ON "github_connection" ("user_id");
