-- Free and Pro plan versions. requirement.md 4.1.
--
-- Seeded by migration rather than by application code: the first login creates
-- a Free subscription inside its transaction (requirement.md 14.1), so the plan
-- version has to exist before any traffic reaches the app.
--
-- Plan versions are immutable (architecture.md 6.1). Changing a price or a
-- limit means inserting a new row, never updating one of these.
INSERT INTO "plan" ("id", "name") VALUES
	('free', 'Free'),
	('pro', 'Pro')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "plan_version" (
	"id", "plan_id", "price_minor", "currency", "monthly_calls",
	"library_limit", "library_size_bytes_limit", "api_key_limit", "share_rate_bps"
) VALUES
	('01920000-0000-7000-8000-000000000001', 'free', 0, 'USD', 1000, 5, 20971520, 3, 2000),
	('01920000-0000-7000-8000-000000000002', 'pro', 500, 'USD', 5000, 25, 104857600, 20, 2000)
ON CONFLICT ("id") DO NOTHING;
