-- Who asked for an operation. The scheduled drain now queues refreshes from
-- each source's refresh policy (architecture.md 8.4); the queue screen tells
-- those apart from an operator's button. Rows written before this were all
-- requested by hand, which the default records correctly.
ALTER TABLE "workflow_operation" ADD COLUMN IF NOT EXISTS "trigger" text NOT NULL DEFAULT 'manual';
