/**
 * Reading anchor proofs against a real database. requirement.md 6.4 and
 * aptos-anchoring-proposal.md 4.2/4.5.1: the Anchor column has one meaning
 * wherever it appears, only a confirmed batch is "anchored", and the
 * credential-free path may not tell a stranger apart a library that is not
 * routable from one that does not exist.
 *
 * Runs only when TEST_DATABASE_URL points at a disposable database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DATABASE_URL ?? 'postgres://unused';
process.env.SESSION_SIGNING_SECRET ??= 'test-secret-that-is-long-enough-000000';

const { anchoredPublicIds } = await import('@/lib/application/libraries/catalog');
const { publicVersionAnchor, splitPinnedId } = await import('@/lib/application/anchors');
const { db, schema } = await import('@/lib/infrastructure/postgres/client');
const { uuidv7 } = await import('@/lib/domain/id');

const stamp = Date.now();
const workspaceId = crypto.randomUUID();
const libraryIds: string[] = [];
const versionIds: string[] = [];
const batchIds: string[] = [];
const leafIds: string[] = [];

const LABEL = '20260101-abcdef12';

interface Fixture {
  libraryId: string;
  versionId: string;
  publicId: string;
}

async function library(input: {
  slug: string;
  visibility?: 'public' | 'private';
  lifecycleStatus?: 'published' | 'submitted';
  indexStatus?: 'ready' | 'failed';
  currentVersion?: boolean;
}): Promise<Fixture> {
  const database = db();
  const libraryId = crypto.randomUUID();
  const publicId = `/anchors-${stamp}/${input.slug}`;
  libraryIds.push(libraryId);
  await database.insert(schema.library).values({
    id: libraryId,
    publicId,
    title: `Anchor fixture ${input.slug}`,
    ownerWorkspaceId: workspaceId,
    visibility: input.visibility ?? 'public',
    lifecycleStatus: input.lifecycleStatus ?? 'published',
    indexStatus: input.indexStatus ?? 'ready',
  });

  const versionId = uuidv7();
  versionIds.push(versionId);
  await database.insert(schema.libraryVersion).values({
    id: versionId,
    libraryId,
    label: LABEL,
    sourceDigest: `anchor-${stamp}-${input.slug}`,
    parserVersion: 'test',
    chunkerVersion: 'test',
    embeddingModel: 'test',
    indexStatus: 'ready',
    contentMerkleRoot: `content-root-${input.slug}`,
  });
  if (input.currentVersion !== false) {
    await database
      .update(schema.library)
      .set({ currentVersionId: versionId })
      .where(eq(schema.library.id, libraryId));
  }
  return { libraryId, versionId, publicId };
}

/** One leaf for a version, in a batch of the given status. */
async function anchor(input: {
  versionId: string;
  status: 'confirmed' | 'pending' | 'failed';
  leafSchemaVersion?: number;
  txHash?: string;
}): Promise<string> {
  const database = db();
  const batchId = crypto.randomUUID();
  batchIds.push(batchId);
  const at = new Date('2026-01-02T00:00:00Z');
  await database.insert(schema.anchorBatch).values({
    id: batchId,
    subjectType: 'version',
    leafSchemaVersion: input.leafSchemaVersion ?? 1,
    merkleRoot: `root-${batchId}`,
    leafCount: 4,
    windowStart: at,
    windowEnd: at,
    network: 'aptos-testnet',
    txHash: input.txHash ?? `0x${batchId.replace(/-/g, '')}`,
    status: input.status,
    confirmedAt: input.status === 'confirmed' ? at : null,
  });
  const leafId = crypto.randomUUID();
  leafIds.push(leafId);
  await database.insert(schema.anchorLeaf).values({
    id: leafId,
    batchId,
    leafHash: `leaf-${leafId}`,
    leafSchemaVersion: input.leafSchemaVersion ?? 1,
    subjectType: 'version',
    subjectId: input.versionId,
    leafIndex: 2,
    merkleProof: ['sibling-a', 'sibling-b'],
  });
  return batchId;
}

let confirmed: Fixture;
let unanchored: Fixture;
let openBatch: Fixture;
let unready: Fixture;
let noCurrentVersion: Fixture;
let privateLibrary: Fixture;
let reanchored: Fixture;
let supersededSchema: Fixture;

describeWithDb('anchor proofs', () => {
  beforeAll(async () => {
    await db().insert(schema.workspace).values({ id: workspaceId, name: 'anchor-test' });

    confirmed = await library({ slug: 'confirmed' });
    await anchor({ versionId: confirmed.versionId, status: 'confirmed' });

    unanchored = await library({ slug: 'unanchored' });

    /* A leaf in a batch nobody has confirmed is not an anchor yet. */
    openBatch = await library({ slug: 'open-batch' });
    await anchor({ versionId: openBatch.versionId, status: 'pending' });

    /* Anchored, and still not routable: index never became ready. */
    unready = await library({ slug: 'unready', indexStatus: 'failed' });
    await anchor({ versionId: unready.versionId, status: 'confirmed' });

    /* Anchored, and no publication pointer at all. */
    noCurrentVersion = await library({ slug: 'no-current', currentVersion: false });
    await anchor({ versionId: noCurrentVersion.versionId, status: 'confirmed' });

    privateLibrary = await library({ slug: 'private', visibility: 'private' });
    await anchor({ versionId: privateLibrary.versionId, status: 'confirmed' });

    /* Anchored twice under two leaf schemas: the newest confirmed one wins. */
    reanchored = await library({ slug: 'reanchored' });
    await anchor({ versionId: reanchored.versionId, status: 'confirmed', leafSchemaVersion: 1 });
    await anchor({ versionId: reanchored.versionId, status: 'confirmed', leafSchemaVersion: 2 });

    /* A newer schema still in flight does not unsay the confirmed older one. */
    supersededSchema = await library({ slug: 'reanchor-open' });
    await anchor({ versionId: supersededSchema.versionId, status: 'confirmed', leafSchemaVersion: 1 });
    await anchor({ versionId: supersededSchema.versionId, status: 'pending', leafSchemaVersion: 2 });
  });

  afterAll(async () => {
    const database = db();
    if (leafIds.length > 0) {
      await database.delete(schema.anchorLeaf).where(inArray(schema.anchorLeaf.id, leafIds));
    }
    if (batchIds.length > 0) {
      await database.delete(schema.anchorBatch).where(inArray(schema.anchorBatch.id, batchIds));
    }
    if (libraryIds.length > 0) {
      await database
        .update(schema.library)
        .set({ currentVersionId: null })
        .where(inArray(schema.library.id, libraryIds));
    }
    if (versionIds.length > 0) {
      await database
        .delete(schema.libraryVersion)
        .where(inArray(schema.libraryVersion.id, versionIds));
    }
    if (libraryIds.length > 0) {
      await database.delete(schema.library).where(inArray(schema.library.id, libraryIds));
    }
    await database.delete(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  });

  it('reads back only the libraries whose current version is in a confirmed batch', async () => {
    const asked = [
      confirmed.publicId,
      unanchored.publicId,
      openBatch.publicId,
      unready.publicId,
      noCurrentVersion.publicId,
      privateLibrary.publicId,
      `/anchors-${stamp}/never-existed`,
    ];
    const anchored = await anchoredPublicIds(asked);
    expect([...anchored]).toEqual([confirmed.publicId]);
  });

  it('answers nothing for an empty ask without touching the database', async () => {
    expect(await anchoredPublicIds([])).toEqual(new Set());
  });

  it('returns the proof a confirmed batch holds for a pinned public version', async () => {
    const proof = await publicVersionAnchor(`${confirmed.publicId}/${LABEL}`);
    expect(proof).toMatchObject({
      subjectType: 'version',
      subjectId: confirmed.versionId,
      pinnedId: `${confirmed.publicId}/${LABEL}`,
      status: 'anchored',
      batchStatus: 'confirmed',
      network: 'aptos-testnet',
      leafIndex: 2,
      leafCount: 4,
      leafSchemaVersion: 1,
      contentMerkleRoot: 'content-root-confirmed',
    });
    expect(proof?.merkleProof).toEqual(['sibling-a', 'sibling-b']);
    expect(proof?.blockTime).toBe('2026-01-02T00:00:00.000Z');
  });

  it('is honest that an unconfirmed or absent batch is not an anchor', async () => {
    const none = await publicVersionAnchor(`${unanchored.publicId}/${LABEL}`);
    expect(none).toMatchObject({ status: 'pending', batchId: null, batchStatus: null });

    const open = await publicVersionAnchor(`${openBatch.publicId}/${LABEL}`);
    expect(open).toMatchObject({ status: 'pending', batchStatus: 'pending' });
    expect(open?.txHash).not.toBeNull();
  });

  it('answers a library that is not routable exactly as it answers a missing one', async () => {
    const missing = await publicVersionAnchor(`/anchors-${stamp}/never-existed/${LABEL}`);
    expect(missing).toBeNull();

    /* Public, published, anchored -- and its index never became ready. */
    expect(await publicVersionAnchor(`${unready.publicId}/${LABEL}`)).toBe(missing);
    /* Public, published, anchored -- and no current version to route to. */
    expect(await publicVersionAnchor(`${noCurrentVersion.publicId}/${LABEL}`)).toBe(missing);
    /* A private library's existence is not decidable from outside either. */
    expect(await publicVersionAnchor(`${privateLibrary.publicId}/${LABEL}`)).toBe(missing);
    /* And a version that library never built. */
    expect(await publicVersionAnchor(`${confirmed.publicId}/20260101-11111111`)).toBe(missing);
  });

  it('reports the newest confirmed leaf when a version was anchored twice', async () => {
    const proof = await publicVersionAnchor(`${reanchored.publicId}/${LABEL}`);
    expect(proof).toMatchObject({ status: 'anchored', leafSchemaVersion: 2 });

    /* An open re-anchor never downgrades a version that is already anchored. */
    const held = await publicVersionAnchor(`${supersededSchema.publicId}/${LABEL}`);
    expect(held).toMatchObject({ status: 'anchored', leafSchemaVersion: 1 });
    expect(await anchoredPublicIds([supersededSchema.publicId])).toEqual(
      new Set([supersededSchema.publicId]),
    );
  });

  it('refuses an id whose last segment is not a version label', async () => {
    expect(splitPinnedId(confirmed.publicId)).toBeNull();
    expect(await publicVersionAnchor(confirmed.publicId)).toBeNull();
    expect(splitPinnedId(`${confirmed.publicId}/${LABEL}`)).toEqual({
      publicId: confirmed.publicId,
      label: LABEL,
    });
  });
});
