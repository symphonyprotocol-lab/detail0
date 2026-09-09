/**
 * anchors use cases: what the anchor tables hold about a version. Reads only
 * -- the signer that fills these tables is its own track
 * (aptos-anchoring-proposal.md 4.3, 4.6); nothing here writes.
 *
 * A Version Leaf's `subject_id` is the `library_version.id` (the `version_id`
 * of the leaf preimage, proposal 4.2). A version may have been anchored more
 * than once under different leaf schemas (4.5.1); the newest confirmed leaf is
 * the one reported, and the status is honest about the rest: `anchored` only
 * with a confirmed batch, `pending` while a batch is open or none exists yet,
 * `unavailable` when every attempt failed or was superseded.
 */
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Anchor } from '@/contracts/schemas';
import { anchoringMode, type AnchoringMode } from '@/lib/domain/anchoring';
import { isVersionLabelShaped } from '@/lib/domain/library';
import { db, schema } from '@/lib/infrastructure/postgres/client';

/**
 * Whether the public pages may describe anchoring as something the platform
 * does. Off unless ANCHORING_MODE says otherwise (lib/domain/anchoring.ts).
 * The per-version status the tables report is unaffected: `pending` is true
 * whether or not the surrounding copy is shown.
 */
export function anchoringVisible(): boolean {
  return anchoringMode(process.env.ANCHORING_MODE) === 'live';
}

/**
 * How anchoring is wired, for the console's operations view.
 *
 * Addresses only. The signing key is reported as configured or not and never
 * read out: it is the one environment entry that is key material rather than a
 * credential (aptos-anchoring-proposal.md 4.6), and a screen that prints it
 * turns every operator's browser history into a copy.
 */
export interface AnchoringSettings {
  mode: AnchoringMode;
  network: string | null;
  objectAddress: string | null;
  signerAddress: string | null;
  signerConfigured: boolean;
}

export function anchoringSettings(): AnchoringSettings {
  const value = (name: string): string | null => {
    const raw = process.env[name]?.trim();
    return raw ? raw : null;
  };
  return {
    mode: anchoringMode(process.env.ANCHORING_MODE),
    network: value('APTOS_NETWORK'),
    objectAddress: value('APTOS_ANCHOR_OBJECT_ADDRESS'),
    signerAddress: value('APTOS_ANCHOR_ACCOUNT_ADDRESS'),
    signerConfigured: value('APTOS_ANCHOR_SIGNER_KEY') !== null,
  };
}

export {
  anchorAuditHead,
  anchorPublishedVersions,
  previousUtcDay,
  runAnchorTick,
  type AnchorRunResult,
  type SubmitBudget,
} from './run-batch';

export interface VersionAnchorProof extends Anchor {
  subjectType: 'version';
  /** The pinned id the caller asked about, `/owner/repo/label`. */
  pinnedId: string | null;
  batchId: string | null;
  merkleRoot: string | null;
  leafHash: string | null;
  leafIndex: number | null;
  merkleProof: string[] | null;
  leafCount: number | null;
  /** The version's own content root, the input to the leaf (proposal 4.2). */
  contentMerkleRoot: string | null;
  batchStatus: string | null;
}

const BATCH_RANK: Record<string, number> = {
  confirmed: 0,
  submitted: 1,
  pending: 2,
  failed: 3,
  superseded: 4,
};

/** What the tables hold for one version id; `pending` with no rows at all. */
export async function versionAnchor(input: {
  versionId: string;
  contentMerkleRoot?: string | null;
  pinnedId?: string | null;
}): Promise<VersionAnchorProof> {
  const rows = await db()
    .select({
      leafHash: schema.anchorLeaf.leafHash,
      leafIndex: schema.anchorLeaf.leafIndex,
      merkleProof: schema.anchorLeaf.merkleProof,
      leafSchemaVersion: schema.anchorLeaf.leafSchemaVersion,
      batchId: schema.anchorBatch.id,
      merkleRoot: schema.anchorBatch.merkleRoot,
      leafCount: schema.anchorBatch.leafCount,
      network: schema.anchorBatch.network,
      txHash: schema.anchorBatch.txHash,
      status: schema.anchorBatch.status,
      confirmedAt: schema.anchorBatch.confirmedAt,
    })
    .from(schema.anchorLeaf)
    .innerJoin(schema.anchorBatch, eq(schema.anchorBatch.id, schema.anchorLeaf.batchId))
    .where(
      and(
        eq(schema.anchorLeaf.subjectType, 'version'),
        eq(schema.anchorLeaf.subjectId, input.versionId),
      ),
    )
    .orderBy(desc(schema.anchorLeaf.leafSchemaVersion));

  const best = [...rows].sort(
    (a, b) => (BATCH_RANK[a.status] ?? 9) - (BATCH_RANK[b.status] ?? 9),
  )[0];

  const base = {
    subjectType: 'version' as const,
    subjectId: input.versionId,
    pinnedId: input.pinnedId ?? null,
    contentMerkleRoot: input.contentMerkleRoot ?? null,
  };

  if (!best) {
    return {
      ...base,
      status: 'pending',
      network: null,
      txHash: null,
      blockTime: null,
      leafSchemaVersion: null,
      batchId: null,
      merkleRoot: null,
      leafHash: null,
      leafIndex: null,
      merkleProof: null,
      leafCount: null,
      batchStatus: null,
    };
  }

  const status: Anchor['status'] =
    best.status === 'confirmed'
      ? 'anchored'
      : best.status === 'failed' || best.status === 'superseded'
        ? 'unavailable'
        : 'pending';

  return {
    ...base,
    status,
    network: best.network,
    txHash: best.txHash,
    blockTime: best.confirmedAt?.toISOString() ?? null,
    leafSchemaVersion: best.leafSchemaVersion,
    batchId: best.batchId,
    merkleRoot: best.merkleRoot,
    leafHash: best.leafHash,
    leafIndex: best.leafIndex,
    merkleProof: best.merkleProof ?? null,
    leafCount: best.leafCount,
    batchStatus: best.status,
  };
}

/**
 * `/owner/repo/20260101-abcdef12` -> the library's public id and the label.
 * Slugs may never look like a label (requirement.md 6.1), so the last segment
 * decides; null when it is not a label.
 */
export function splitPinnedId(pinnedId: string): { publicId: string; label: string } | null {
  const segments = pinnedId.trim().split('/').filter(Boolean);
  const label = segments.pop();
  if (!label || segments.length === 0 || !isVersionLabelShaped(label)) return null;
  return { publicId: `/${segments.join('/')}`, label };
}

/**
 * The proof for a pinned public version, or null when there is no such
 * routable library or version. Public libraries only: a private version's
 * anchor is reached through the workspace's own screens, never by id
 * (requirement.md 6.4, 私有库…第三方无法判定存在性).
 */
export async function publicVersionAnchor(pinnedId: string): Promise<VersionAnchorProof | null> {
  const split = splitPinnedId(pinnedId);
  if (!split) return null;

  const [row] = await db()
    .select({
      versionId: schema.libraryVersion.id,
      contentMerkleRoot: schema.libraryVersion.contentMerkleRoot,
    })
    .from(schema.libraryVersion)
    .innerJoin(schema.library, eq(schema.library.id, schema.libraryVersion.libraryId))
    /*
     * The routable predicate, in full -- the same one the catalogue and
     * retrieval apply. Two of its clauses were missing here, so a library
     * that is public and published but whose index is not ready (or which has
     * no current version at all) answered about its versions on an endpoint
     * that needs no credential, while every other public surface treats it as
     * not there. "Not routable" and "not found" have to look the same from
     * outside (requirement.md 6.4).
     */
    .where(
      and(
        eq(schema.library.publicId, split.publicId),
        eq(schema.library.visibility, 'public'),
        eq(schema.library.lifecycleStatus, 'published'),
        eq(schema.library.indexStatus, 'ready'),
        isNotNull(schema.library.currentVersionId),
        isNull(schema.library.deletedAt),
        eq(schema.libraryVersion.label, split.label),
      ),
    )
    .limit(1);
  if (!row) return null;

  return versionAnchor({
    versionId: row.versionId,
    contentMerkleRoot: row.contentMerkleRoot,
    pinnedId: `${split.publicId}/${split.label}`,
  });
}
