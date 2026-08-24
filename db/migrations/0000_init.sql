CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."anchor_batch_status" AS ENUM('pending', 'submitted', 'confirmed', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."anchor_subject_type" AS ENUM('version', 'audit_head', 'earning_statement');--> statement-breakpoint
CREATE TYPE "public"."claim_method" AS ENUM('github_permission', 'dns_txt', 'well_known');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('pending', 'verified', 'failed', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."index_status" AS ENUM('pending', 'processing', 'ready', 'failed', 'stale', 'deleting');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_status" AS ENUM('draft', 'submitted', 'reviewing', 'changes_requested', 'published', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."policy_mode" AS ENUM('quality', 'select');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'committed', 'released');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('accrued', 'held', 'paid', 'clawed_back', 'voided');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('github', 'website', 'llms_txt', 'markdown', 'pdf', 'openapi', 'notion');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'trialing');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'developer', 'viewer');--> statement-breakpoint
CREATE TABLE "addon_grant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"calls_granted" integer NOT NULL,
	"calls_consumed" integer DEFAULT 0 NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"provider_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_permission" (
	"role_id" text NOT NULL,
	"capability" text NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "admin_permission_role_id_capability_pk" PRIMARY KEY("role_id","capability")
);
--> statement-breakpoint
CREATE TABLE "admin_role" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "administrator" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"mfa_enrolled_at" timestamp with time zone,
	"status" text DEFAULT 'invited' NOT NULL,
	"last_active_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "administrator_role" (
	"administrator_id" uuid NOT NULL,
	"role_id" text NOT NULL,
	CONSTRAINT "administrator_role_administrator_id_role_id_pk" PRIMARY KEY("administrator_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "anchor_batch" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" "anchor_subject_type" NOT NULL,
	"leaf_schema_version" integer NOT NULL,
	"merkle_root" text NOT NULL,
	"leaf_count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"network" text NOT NULL,
	"tx_hash" text,
	"status" "anchor_batch_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "anchor_leaf" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"leaf_hash" text NOT NULL,
	"leaf_schema_version" integer NOT NULL,
	"subject_type" "anchor_subject_type" NOT NULL,
	"subject_id" text NOT NULL,
	"leaf_index" integer NOT NULL,
	"merkle_proof" jsonb
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"last_four" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"environment" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"administrator_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"reason" text,
	"before_value" jsonb,
	"after_value" jsonb,
	"ip_digest" text,
	"result" text NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunk" (
	"id" uuid PRIMARY KEY NOT NULL,
	"library_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"body" text NOT NULL,
	"tokens" integer NOT NULL,
	"citation" jsonb NOT NULL,
	"safety_status" text DEFAULT 'clean' NOT NULL,
	"search_vector" text,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"library_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"object_key" text
);
--> statement-breakpoint
CREATE TABLE "earning_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"library_id" uuid NOT NULL,
	"version_id" uuid,
	"owner_workspace_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"share_rate_bps" integer NOT NULL,
	"period_id" text NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"domain_tag" text,
	"language" text,
	"owner_workspace_id" uuid,
	"is_platform_library" boolean DEFAULT false NOT NULL,
	"visibility" "visibility" NOT NULL,
	"lifecycle_status" "lifecycle_status" NOT NULL,
	"index_status" "index_status" NOT NULL,
	"current_version_id" uuid,
	"storage_bytes" bigint DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_successful_refresh_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_alias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_public_id" text NOT NULL,
	"library_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_claim" (
	"id" uuid PRIMARY KEY NOT NULL,
	"library_id" uuid NOT NULL,
	"claimant_workspace_id" uuid NOT NULL,
	"method" "claim_method" NOT NULL,
	"challenge_token_hash" text NOT NULL,
	"status" "claim_status" NOT NULL,
	"failure_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"ruling_admin_id" uuid,
	"ruling_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"library_id" uuid NOT NULL,
	"version_id" uuid,
	"stage" text NOT NULL,
	"outcome" text,
	"feedback" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "library_score" (
	"id" uuid PRIMARY KEY NOT NULL,
	"library_id" uuid NOT NULL,
	"algorithm_version" text NOT NULL,
	"trust_score" integer NOT NULL,
	"benchmark_score" integer NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"library_id" uuid NOT NULL,
	"label" text NOT NULL,
	"source_digest" text NOT NULL,
	"parser_version" text NOT NULL,
	"chunker_version" text NOT NULL,
	"embedding_model" text NOT NULL,
	"content_merkle_root" text,
	"index_status" "index_status" NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"total_chunks" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout" (
	"id" uuid PRIMARY KEY NOT NULL,
	"publisher_account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"provider_reference" text,
	"status" text NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"monthly_calls" integer NOT NULL,
	"library_limit" integer NOT NULL,
	"library_size_bytes_limit" bigint NOT NULL,
	"api_key_limit" integer NOT NULL,
	"share_rate_bps" integer DEFAULT 2000 NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_library_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_type" text NOT NULL,
	"target_value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"mode" "policy_mode",
	"source_types" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quality_filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publisher_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider_account_id" text,
	"tax_status" text DEFAULT 'pending' NOT NULL,
	"agreement_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY NOT NULL,
	"library_id" uuid NOT NULL,
	"reporter_user_id" uuid,
	"category" text NOT NULL,
	"detail" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"request_id" text NOT NULL,
	"operation" text NOT NULL,
	"status_code" integer NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_period" (
	"id" text PRIMARY KEY NOT NULL,
	"net_revenue_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"total_billed_calls" bigint NOT NULL,
	"total_attributable_calls" bigint NOT NULL,
	"share_rate_bps" integer NOT NULL,
	"pool_minor" bigint NOT NULL,
	"locked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settlement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"period_id" text NOT NULL,
	"publisher_account_id" uuid NOT NULL,
	"library_id" uuid NOT NULL,
	"attributable_calls" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "settlement_status" NOT NULL,
	"statement_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY NOT NULL,
	"library_id" uuid NOT NULL,
	"type" "source_type" NOT NULL,
	"location" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credential_ref" text,
	"refresh_policy" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"status" "subscription_status" NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"library_id" uuid,
	"version_id" uuid,
	"operation" text NOT NULL,
	"entrypoint" text NOT NULL,
	"debit_source" text NOT NULL,
	"addon_grant_id" uuid,
	"status_code" integer NOT NULL,
	"latency_ms" integer,
	"input_tokens" integer,
	"returned_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_reservation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"status" "reservation_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_summary" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"bucket_date" timestamp with time zone NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"library_id" uuid,
	"operation_type" text NOT NULL,
	"source_digest" text,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_member" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_member_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "addon_grant" ADD CONSTRAINT "addon_grant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_permission" ADD CONSTRAINT "admin_permission_role_id_admin_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrator_role" ADD CONSTRAINT "administrator_role_administrator_id_administrator_id_fk" FOREIGN KEY ("administrator_id") REFERENCES "public"."administrator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrator_role" ADD CONSTRAINT "administrator_role_role_id_admin_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anchor_leaf" ADD CONSTRAINT "anchor_leaf_batch_id_anchor_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."anchor_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_administrator_id_administrator_id_fk" FOREIGN KEY ("administrator_id") REFERENCES "public"."administrator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_version_id_library_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."library_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_version_id_library_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."library_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earning_event" ADD CONSTRAINT "earning_event_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earning_event" ADD CONSTRAINT "earning_event_version_id_library_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."library_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earning_event" ADD CONSTRAINT "earning_event_owner_workspace_id_workspace_id_fk" FOREIGN KEY ("owner_workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earning_event" ADD CONSTRAINT "earning_event_plan_version_id_plan_version_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library" ADD CONSTRAINT "library_owner_workspace_id_workspace_id_fk" FOREIGN KEY ("owner_workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_alias" ADD CONSTRAINT "library_alias_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_claim" ADD CONSTRAINT "library_claim_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_claim" ADD CONSTRAINT "library_claim_claimant_workspace_id_workspace_id_fk" FOREIGN KEY ("claimant_workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_review" ADD CONSTRAINT "library_review_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_review" ADD CONSTRAINT "library_review_version_id_library_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."library_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_score" ADD CONSTRAINT "library_score_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_version" ADD CONSTRAINT "library_version_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_account" ADD CONSTRAINT "oauth_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_publisher_account_id_publisher_account_id_fk" FOREIGN KEY ("publisher_account_id") REFERENCES "public"."publisher_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_version" ADD CONSTRAINT "plan_version_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_library_entry" ADD CONSTRAINT "policy_library_entry_policy_version_id_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_version" ADD CONSTRAINT "policy_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_account" ADD CONSTRAINT "publisher_account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_log" ADD CONSTRAINT "request_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_period_id_revenue_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."revenue_period"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_publisher_account_id_publisher_account_id_fk" FOREIGN KEY ("publisher_account_id") REFERENCES "public"."publisher_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_version_id_plan_version_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_version_id_library_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."library_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_addon_grant_id_addon_grant_id_fk" FOREIGN KEY ("addon_grant_id") REFERENCES "public"."addon_grant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservation" ADD CONSTRAINT "usage_reservation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_summary" ADD CONSTRAINT "usage_summary_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_operation" ADD CONSTRAINT "workflow_operation_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "administrator_username_uq" ON "administrator" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "anchor_batch_tx_uq" ON "anchor_batch" USING btree ("tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "anchor_leaf_subject_uq" ON "anchor_leaf" USING btree ("subject_type","subject_id","leaf_schema_version");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_uq" ON "api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_log_hash_uq" ON "audit_log" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "audit_log_time_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chunk_library_version_idx" ON "chunk" USING btree ("library_id","version_id");--> statement-breakpoint
CREATE INDEX "chunk_embedding_hnsw_idx" ON "chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "earning_event_request_uq" ON "earning_event" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "earning_event_period_library_idx" ON "earning_event" USING btree ("period_id","library_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_public_id_uq" ON "library" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "library_owner_idx" ON "library" USING btree ("owner_workspace_id");--> statement-breakpoint
CREATE INDEX "library_visibility_lifecycle_idx" ON "library" USING btree ("visibility","lifecycle_status");--> statement-breakpoint
CREATE UNIQUE INDEX "library_alias_uq" ON "library_alias" USING btree ("from_public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_claim_pending_uq" ON "library_claim" USING btree ("library_id") WHERE "library_claim"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "library_claim_claimant_idx" ON "library_claim" USING btree ("claimant_workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_provider_subject_uq" ON "oauth_account" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_event_uq" ON "payment_event" USING btree ("provider","external_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_event_request_uq" ON "usage_event" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "usage_event_workspace_time_idx" ON "usage_event" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_reservation_request_uq" ON "usage_reservation" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_summary_uq" ON "usage_summary" USING btree ("workspace_id","bucket_date");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_operation_uq" ON "workflow_operation" USING btree ("library_id","source_digest","operation_type");