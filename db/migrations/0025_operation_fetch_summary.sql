-- How a build fetched its pages: our own fetch or a rendering provider
-- (Firecrawl, Jina), counted per page. Written by the build after the
-- fetch-snapshot step and shown in the console's refresh queue, so an
-- operator can see which website libraries needed a browser. Null for
-- operations that fetch nothing and for sources with no such choice.
ALTER TABLE "workflow_operation" ADD COLUMN IF NOT EXISTS "fetch_summary" jsonb;
