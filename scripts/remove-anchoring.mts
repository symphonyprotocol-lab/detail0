/**
 * Drops anchoring's tables. The database half of removing the side system.
 *
 *   npm run anchor:remove                  # says what it would destroy
 *   npm run anchor:remove -- --confirm     # destroys it
 *
 * Two steps on purpose. The proofs in `anchor_leaf` are the only thing that
 * connects a version to a root on chain; the events survive this and stay true,
 * but nobody can produce a proof for them afterwards. A dry run first means the
 * number of proofs about to stop existing is on screen before anyone types
 * --confirm, rather than in a changelog afterwards.
 *
 * To stop anchoring without erasing what was anchored, unset the APTOS_*
 * variables instead. The workflow finds itself unconfigured and skips, and
 * every existing proof keeps verifying.
 *
 * `.mts` because the env has to be loaded before anything reads DATABASE_URL.
 */
import { readFileSync } from 'node:fs';
import nextEnv from '@next/env';

// `@next/env` is CommonJS, so it arrives as a default export under ESM.
nextEnv.loadEnvConfig(process.cwd());

const { db } = await import('@/lib/infrastructure/postgres/client');
const { sql } = await import('drizzle-orm');

const counts = await db().execute(
  sql`select
        (select count(*) from anchor_batch) as batches,
        (select count(*) from anchor_leaf) as leaves,
        (select count(*) from anchor_batch where status = 'confirmed') as confirmed`,
);
const row = (counts.rows?.[0] ?? {}) as Record<string, unknown>;

console.log(
  `\n  anchor_batch: ${row.batches} row(s), ${row.confirmed} confirmed on chain` +
    `\n  anchor_leaf:  ${row.leaves} proof(s)\n`,
);

if (!process.argv.includes('--confirm')) {
  console.log(
    '  Dry run. Re-run with --confirm to drop both tables and their enums.\n' +
      '  The chain keeps its events; the proofs that make them checkable do not.\n' +
      '  To stop anchoring without destroying proofs, unset the APTOS_* variables.\n',
  );
  process.exit(0);
}

const statements = readFileSync('db/teardown/anchoring.sql', 'utf8')
  .split('\n')
  .filter((line) => !line.startsWith('--') && line.trim().length > 0)
  .join('\n')
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) await db().execute(sql.raw(statement));

console.log('  Dropped. Remove the rest of the feature with the checklist in move/README.md.\n');
