-- The Additional Calls pack as a Plan Version, and the capability blob the
-- plan screen edits.
--
-- requirement.md 4.3 says the console's subscription configuration maintains
-- the Plan Version of exactly three tiers -- Free, Pro and Additional Calls --
-- so the pack's price and its calls-per-pack have to be versioned and frozen
-- like the other two. They already are, per purchase, in `addon_grant`; what
-- was missing is the row that says what the *next* purchase costs.
--
-- The pack is still not a subscription tier (architecture.md 6.1): nothing in
-- `subscription` may point at this version. It grants calls and nothing else,
-- and its buyer keeps the Pro entitlements they already had, which is why its
-- library, capacity, key and share-rate columns carry 0 rather than a number
-- that would read as a real ceiling. `PACK_INHERITS_PRO` in lib/domain/plans.ts
-- is the same sentinel on the application side.
INSERT INTO "plan" ("id", "name") VALUES
	('addon', 'Additional Calls')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "plan_version" (
	"id", "plan_id", "price_minor", "currency", "monthly_calls",
	"library_limit", "library_size_bytes_limit", "api_key_limit", "share_rate_bps",
	"capabilities"
) VALUES
	('01920000-0000-7000-8000-000000000003', 'addon', 500, 'USD', 5000, 0, 0, 0, 0,
	 '{"publicReviewRequired": true, "addonPurchase": false}'::jsonb)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- The seeded Free and Pro versions predate the capability blob and carry `{}`,
-- which the console would read as "public review is off" if it trusted the
-- absence. It does not -- `readCapabilities` defaults the flag to on -- but the
-- stored row should say what it means rather than rely on that.
--
-- Only the seeded pair is touched: a version minted since then already carries
-- its own blob, and rewriting one would be editing an immutable row.
UPDATE "plan_version"
SET "capabilities" = jsonb_build_object(
	'publicReviewRequired', true,
	'addonPurchase', "plan_id" = 'pro'
)
WHERE "id" IN (
	'01920000-0000-7000-8000-000000000001',
	'01920000-0000-7000-8000-000000000002'
) AND "capabilities" = '{}'::jsonb;
--> statement-breakpoint
-- The plan screen reads the newest version per tier and the history under it,
-- and counts the subscriptions still billing against each row. Both are
-- ordered scans today; neither column is indexed.
CREATE INDEX IF NOT EXISTS "plan_version_plan_idx" ON "plan_version" USING btree ("plan_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_plan_version_idx" ON "subscription" USING btree ("plan_version_id");
