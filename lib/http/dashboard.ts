/**
 * Per-request readers for the dashboard shell.
 *
 * `usageOverview` rebuilds the workspace's usage summary before it reports --
 * a transaction that deletes and re-upserts up to ninety daily rows -- and the
 * shell reads it twice for one navigation: the layout for the sidebar quota,
 * the page for the same figure in its stat tiles. Two write transactions and a
 * doubled read for one render. `cache()` makes it one, and only within the
 * request; it lives here rather than in `lib/application/plans` so the
 * application layer keeps no framework import.
 */
import { cache } from 'react';
import { usageOverview } from '@/lib/application/plans';

export const workspaceUsage = cache(usageOverview);
