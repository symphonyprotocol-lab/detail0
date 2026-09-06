-- A person's Notion account, connected for page imports.
--
-- The counterpart of github_connection for the one source that cannot be
-- read anonymously: the token is the only way to fetch the pages the person
-- shared with the integration, so it is kept for the library's refreshes as
-- well as for the wizard's listing. Sealed (AES-GCM, key derived from the
-- session secret) before it is written and kept in its own table, apart from
-- business rows (requirement.md 12: "OAuth/Notion/GitHub Token 加密保存，并与
-- 普通业务数据分离"). One connection per user; reconnecting replaces the token.
CREATE TABLE IF NOT EXISTS "notion_connection" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "user"("id"),
  "bot_id" text NOT NULL,
  "notion_workspace_id" text NOT NULL,
  "workspace_name" text,
  "notion_user_id" text,
  "owner_name" text,
  "token_sealed" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notion_connection_user_uq" ON "notion_connection" ("user_id");
