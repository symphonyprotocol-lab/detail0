/**
 * Puts a failed anchoring batch's subjects back in the queue.
 *
 *   npm run anchor:release -- --batch <uuid>
 *
 * Rare enough not to earn a console page. A batch only reaches `failed` after
 * submission exhausted its attempts or the chain aborted it, and without this
 * its subjects read `unavailable` forever -- so the recovery has to exist
 * somewhere, just not as a screen, a sidebar entry and two languages of copy.
 *
 * Run by whoever already holds the database credentials, like
 * create-administrator.mts. The guard rails are in the use case, not here: only
 * a failed batch qualifies, the leaves go and the row stays.
 *
 * `.mts` because the env has to be loaded before anything reads DATABASE_URL.
 */
import nextEnv from '@next/env';

// `@next/env` is CommonJS, so it arrives as a default export under ESM.
nextEnv.loadEnvConfig(process.cwd());

const { releaseFailedBatch } = await import('@/lib/application/anchors');
const { AdminChangeRefused } = await import('@/lib/domain/admin');

function argument(name: string): string | undefined {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const batchId = argument('batch')?.trim();
if (!batchId) {
  console.error('\n  --batch is required, e.g. --batch 0193d1f0-0000-7000-8000-000000000001\n');
  process.exit(1);
}

try {
  const released = await releaseFailedBatch({ batchId });
  console.log(
    `\n  Released ${released.released} ${released.subjectType} subject(s) from batch ${released.batchId}.` +
      '\n  They are anchored again on the next scheduled run.\n',
  );
} catch (error) {
  if (error instanceof AdminChangeRefused) {
    console.error(`\n  ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
