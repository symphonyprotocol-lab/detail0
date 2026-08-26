/**
 * Use case: append one entry to the administrative audit log.
 *
 * `audit_log` is append only and hash chained: each row carries the previous
 * row's hash, so removing or editing history breaks the chain and the daily
 * head that gets anchored (architecture.md 14, requirement.md 5.3). Nothing
 * here ever updates or deletes.
 *
 * Records are kept 365 days and must carry operator, target, before/after
 * values, reason, result, time and a *summary* of the network origin -- never
 * the address itself (requirement.md 12, architecture.md 11.2).
 */
import { desc, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { hmacSha256, sha256 } from '@/lib/infrastructure/crypto/tokens';

export interface AuditEntry {
  /** Null when the actor could not be identified, e.g. a failed sign-in. */
  administratorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
  /** Raw client address; hashed here and never stored or logged in the clear. */
  clientAddress?: string | null;
  result: 'success' | 'failure';
}

/**
 * Advisory lock key for the audit chain. Arbitrary but fixed: every writer in
 * every instance has to pick the same number for the lock to serialize them.
 */
const AUDIT_CHAIN_LOCK = 0x7265_63_30;

function signingSecret(): string {
  return process.env.SESSION_SIGNING_SECRET ?? 'dev';
}

/** Keyed so the digest cannot be reversed by hashing the IPv4 space. */
export async function originDigest(address: string | null | undefined): Promise<string | null> {
  if (!address) return null;
  const digest = await hmacSha256(signingSecret(), `audit-origin:${address}`);
  return digest.slice(0, 16);
}

/**
 * The chained hash for one row.
 *
 * Field order is fixed and every value is length-prefixed, so two different
 * entries cannot serialize to the same string by shifting a delimiter across a
 * boundary.
 */
export async function auditHash(input: {
  prevHash: string | null;
  administratorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  ipDigest: string | null;
  result: string;
  createdAt: Date;
}): Promise<string> {
  const parts = [
    input.prevHash ?? '',
    input.administratorId ?? '',
    input.action,
    input.targetType ?? '',
    input.targetId ?? '',
    input.reason ?? '',
    input.beforeValue === undefined ? '' : JSON.stringify(input.beforeValue),
    input.afterValue === undefined ? '' : JSON.stringify(input.afterValue),
    input.ipDigest ?? '',
    input.result,
    input.createdAt.toISOString(),
  ];
  return sha256(parts.map((part) => `${part.length}:${part}`).join('|'));
}

/**
 * Writes the entry and returns its hash.
 *
 * Failures are swallowed and logged: an audit write must not be the thing that
 * stops an administrator signing out, and a lost row is visible as a broken
 * chain at verification time. It is never allowed to fail *silently* -- the
 * error line is the operator's signal.
 */
export async function recordAudit(entry: AuditEntry): Promise<string | null> {
  try {
    const database = db();
    const now = new Date();
    const ipDigest = await originDigest(entry.clientAddress);

    return await database.transaction(async (tx) => {
      /*
       * Head-read and insert have to be one critical section. Without it two
       * concurrent writers adopt the same `prev_hash`, the chain forks, and a
       * row on the orphaned branch can then be removed without breaking a walk
       * from the head -- which is the whole property this chain exists to give
       * (architecture.md 14). The advisory lock is transaction scoped, so it is
       * released on commit or rollback either way.
       */
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);

      const [previous] = await tx
        .select({ hash: schema.auditLog.hash })
        .from(schema.auditLog)
        .orderBy(desc(schema.auditLog.seq))
        .limit(1);

      const row = {
        administratorId: entry.administratorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        reason: entry.reason ?? null,
        beforeValue: entry.beforeValue ?? null,
        afterValue: entry.afterValue ?? null,
        ipDigest,
        result: entry.result,
        createdAt: now,
      };

      const hash = await auditHash({ ...row, prevHash: previous?.hash ?? null });

      await tx.insert(schema.auditLog).values({
        id: crypto.randomUUID(),
        ...row,
        prevHash: previous?.hash ?? null,
        hash,
      });
      return hash;
    });
  } catch (error) {
    console.error(
      `audit write failed action=${entry.action} result=${entry.result} detail=${
        error instanceof Error ? error.message : 'unknown'
      }`,
    );
    return null;
  }
}
