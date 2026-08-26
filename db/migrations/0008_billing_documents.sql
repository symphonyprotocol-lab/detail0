-- The console's read-only mirror of the Payment Provider's billing documents.
--
-- requirement.md 5.3 asks the subscription-billing screen to show orders,
-- payment state, refunds and invoicing status, and says every human action goes
-- through the provider. Nothing on this side could answer that: `subscription`
-- holds a period and a provider id but no amount and no payment outcome,
-- `addon_grant` holds one purchase's price but nothing about whether it
-- cleared, and `payment_event` holds verified webhook payloads -- an
-- append-only log, keyed for idempotency, not a table a screen can filter.
--
-- This is the projection of that log. One row per provider document, rewritten
-- in place as its state moves, which is why `(provider, external_id)` is a
-- unique index rather than the primary key: the row is mutable because it
-- mirrors something mutable, and it still needs a stable id of its own for the
-- detail screen to link to.
--
-- What may live here is fixed by architecture.md 11.3 -- the external id, the
-- status, the amount and the currency. Cards, billing addresses and the
-- provider's rendered invoice stay at the provider and are deliberately not
-- columns. `method` is a payment method *type* (`card`, `alipay`), never an
-- instrument: an operator routing a chargeback needs to know it was a card,
-- and a last-four is card data by any useful definition.
CREATE TYPE "public"."billing_document_kind" AS ENUM('subscription', 'pack');--> statement-breakpoint
-- The provider's own vocabulary, mirrored rather than reshaped. One enum covers
-- issuing and payment because that is how a provider models a document;
-- splitting it would invent a distinction the source of truth does not make,
-- and a mirror that reshapes what it mirrors cannot be reconciled against the
-- provider's dashboard.
CREATE TYPE "public"."billing_document_status" AS ENUM('draft', 'open', 'paid', 'failed', 'refunded', 'void', 'uncollectible');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"number" text NOT NULL,
	"kind" "billing_document_kind" NOT NULL,
	"status" "billing_document_status" NOT NULL,
	"amount_minor" integer NOT NULL,
	-- Refunds are their own column rather than a rewritten amount: what was
	-- charged is a fact about the past, and a dispute that cannot see both
	-- numbers cannot be settled. Partial refunds need it too.
	"refunded_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"method" text,
	"subscription_id" uuid,
	"addon_grant_id" uuid,
	"plan_version_id" uuid,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"issued_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"last_event_id" uuid,
	-- The instant the provider says this state was true, not the instant we
	-- wrote it. Webhooks arrive out of order, so this is what decides whether
	-- an arriving event is newer than the row it would overwrite.
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_addon_grant_id_addon_grant_id_fk" FOREIGN KEY ("addon_grant_id") REFERENCES "public"."addon_grant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_plan_version_id_plan_version_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_last_event_id_payment_event_id_fk" FOREIGN KEY ("last_event_id") REFERENCES "public"."payment_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The idempotency key of the mirror. A provider redelivers webhooks, and two
-- deliveries of one document must be one row in two states, never two rows.
CREATE UNIQUE INDEX IF NOT EXISTS "billing_document_uq" ON "billing_document" USING btree ("provider","external_id");--> statement-breakpoint
-- The console's default order. `issued_at` alone is not a total order -- a
-- provider stamps a batch with one instant -- so the id breaks the tie and
-- paging stops dropping and repeating rows across page boundaries.
CREATE INDEX IF NOT EXISTS "billing_document_issued_idx" ON "billing_document" USING btree ("issued_at" DESC,"id" DESC);--> statement-breakpoint
-- The status filter, and the summary's "what is still owed" scan.
CREATE INDEX IF NOT EXISTS "billing_document_status_idx" ON "billing_document" USING btree ("status","issued_at" DESC);--> statement-breakpoint
-- One workspace's billing history, which the account detail screen reads.
CREATE INDEX IF NOT EXISTS "billing_document_workspace_idx" ON "billing_document" USING btree ("workspace_id","issued_at" DESC);--> statement-breakpoint
-- Money is checked where it is stored, not only where it is parsed. The
-- application refuses these too (lib/domain/billing), but a mirror is written
-- by adapters, and an adapter that confuses minor and major units, or reports
-- more back than went out, must not be able to make the revenue readout
-- negative.
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_amount_ck" CHECK ("amount_minor" >= 0 AND "refunded_minor" >= 0 AND "refunded_minor" <= "amount_minor");
