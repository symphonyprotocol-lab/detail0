/**
 * Read models for the claim screens. requirement.md 5.1, 5.2.
 *
 * Nothing here decides anything; the dashboard, the public detail page and
 * the claim page read what the write paths left behind.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ClaimFailureReason } from '@/contracts/errors';
import type { ClaimMethod, ClaimStatus, SourceType } from '@/lib/domain';
import { claimMethodsFor } from '@/lib/domain';
import {
  checkStates,
  dnsRecordName,
  isDisputedClaim,
  ownershipView,
  verificationDomain,
  wellKnownUrl,
  type ClaimCheckView,
  type OwnershipView,
} from '@/lib/domain/claim';
import { db, schema } from '@/lib/infrastructure/postgres/client';
import { ref } from '@/lib/application/administration/column-ref';
import { isUuid, loadClaim, notFound, visibleLibrary } from './shared';

export interface WorkspaceClaimRow {
  id: string;
  libraryId: string;
  libraryPublicId: string;
  libraryTitle: string;
  method: ClaimMethod;
  status: ClaimStatus;
  failureReason: ClaimFailureReason | null;
  attempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
  /** The library has another owner, so this claim waits on an administrator. */
  disputed: boolean;
  ownerName: string | null;
}

const ownerName = sql<string | null>`(
  select ${ref(schema.workspace.name)} from ${schema.workspace}
  where ${ref(schema.workspace.id)} = ${ref(schema.library.ownerWorkspaceId)}
)`;

/** Every claim this workspace has opened, newest first. */
export async function listWorkspaceClaims(workspaceId: string): Promise<WorkspaceClaimRow[]> {
  const rows = await db()
    .select({
      id: schema.libraryClaim.id,
      libraryId: schema.libraryClaim.libraryId,
      libraryPublicId: schema.library.publicId,
      libraryTitle: schema.library.title,
      method: schema.libraryClaim.method,
      status: schema.libraryClaim.status,
      failureReason: schema.libraryClaim.failureReason,
      attempts: schema.libraryClaim.attempts,
      expiresAt: schema.libraryClaim.expiresAt,
      verifiedAt: schema.libraryClaim.verifiedAt,
      createdAt: schema.libraryClaim.createdAt,
      ownerWorkspaceId: schema.library.ownerWorkspaceId,
      ownerName,
    })
    .from(schema.libraryClaim)
    .innerJoin(schema.library, eq(schema.library.id, schema.libraryClaim.libraryId))
    .where(
      and(eq(schema.libraryClaim.claimantWorkspaceId, workspaceId), isNull(schema.library.deletedAt)),
    )
    .orderBy(desc(schema.libraryClaim.createdAt));

  return rows.map((row) => ({
    id: row.id,
    libraryId: row.libraryId,
    libraryPublicId: row.libraryPublicId,
    libraryTitle: row.libraryTitle,
    method: row.method,
    status: row.status,
    failureReason: row.failureReason as ClaimFailureReason | null,
    attempts: row.attempts,
    expiresAt: row.expiresAt,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
    disputed: isDisputedClaim({
      status: row.status,
      ownerWorkspaceId: row.ownerWorkspaceId,
      claimantWorkspaceId: workspaceId,
    }),
    ownerName: row.ownerName,
  }));
}

/**
 * How each of the given libraries stands with this workspace: claimed, owned
 * by creation, pending, failed or unclaimed. One query for the whole list.
 */
export async function ownershipForLibraries(
  workspaceId: string,
  libraryIds: string[],
): Promise<Map<string, OwnershipView>> {
  const result = new Map<string, OwnershipView>();
  if (libraryIds.length === 0) return result;

  const database = db();
  const [libraries, claims] = await Promise.all([
    database
      .select({
        id: schema.library.id,
        ownerWorkspaceId: schema.library.ownerWorkspaceId,
        ownerName,
      })
      .from(schema.library)
      .where(inArray(schema.library.id, libraryIds)),
    database
      .select({
        id: schema.libraryClaim.id,
        libraryId: schema.libraryClaim.libraryId,
        status: schema.libraryClaim.status,
        failureReason: schema.libraryClaim.failureReason,
        attempts: schema.libraryClaim.attempts,
        expiresAt: schema.libraryClaim.expiresAt,
        verifiedAt: schema.libraryClaim.verifiedAt,
      })
      .from(schema.libraryClaim)
      .where(
        and(
          eq(schema.libraryClaim.claimantWorkspaceId, workspaceId),
          inArray(schema.libraryClaim.libraryId, libraryIds),
        ),
      )
      .orderBy(desc(schema.libraryClaim.createdAt)),
  ]);

  const newest = new Map<string, (typeof claims)[number]>();
  for (const claim of claims) {
    if (!newest.has(claim.libraryId)) newest.set(claim.libraryId, claim);
  }

  for (const library of libraries) {
    const claim = newest.get(library.id);
    result.set(
      library.id,
      ownershipView(
        {
          ownerWorkspaceId: library.ownerWorkspaceId,
          ownerName: library.ownerName,
          claim: claim
            ? {
                id: claim.id,
                status: claim.status,
                failureReason: claim.failureReason as ClaimFailureReason | null,
                attempts: claim.attempts,
                expiresAt: claim.expiresAt,
                verifiedAt: claim.verifiedAt,
              }
            : null,
        },
        workspaceId,
      ),
    );
  }
  return result;
}

export interface PublicClaimStatus {
  claimed: boolean;
  ownerName: string | null;
  /** When the owner's verified claim went through; null for an owner by creation. */
  claimedAt: Date | null;
}

/** What the public detail page says about ownership. requirement.md 5.1, 7.3.4. */
export async function publicClaimStatus(libraryPublicId: string): Promise<PublicClaimStatus> {
  const [row] = await db()
    .select({
      id: schema.library.id,
      ownerWorkspaceId: schema.library.ownerWorkspaceId,
      ownerName,
    })
    .from(schema.library)
    .where(and(eq(schema.library.publicId, libraryPublicId), isNull(schema.library.deletedAt)))
    .limit(1);
  if (!row || !row.ownerWorkspaceId) return { claimed: false, ownerName: null, claimedAt: null };

  const [claim] = await db()
    .select({ verifiedAt: schema.libraryClaim.verifiedAt })
    .from(schema.libraryClaim)
    .where(
      and(
        eq(schema.libraryClaim.libraryId, row.id),
        eq(schema.libraryClaim.claimantWorkspaceId, row.ownerWorkspaceId),
        eq(schema.libraryClaim.status, 'verified'),
      ),
    )
    .orderBy(desc(schema.libraryClaim.verifiedAt))
    .limit(1);

  return { claimed: true, ownerName: row.ownerName, claimedAt: claim?.verifiedAt ?? null };
}

/** What the claim page needs about the library before a claim exists. */
export interface ClaimTarget {
  publicId: string;
  title: string;
  sourceType: SourceType;
  location: string;
  methods: readonly ClaimMethod[];
  /** Owned by another workspace, so a new claim would be a dispute. */
  ownedByOther: boolean;
  ownedBySelf: boolean;
  ownerName: string | null;
}

export async function claimTarget(
  workspaceId: string,
  libraryPublicId: string,
): Promise<ClaimTarget> {
  const library = await visibleLibrary(libraryPublicId);
  let owner: string | null = null;
  if (library.ownerWorkspaceId) {
    const [row] = await db()
      .select({ name: schema.workspace.name })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, library.ownerWorkspaceId));
    owner = row?.name ?? null;
  }
  return {
    publicId: library.publicId,
    title: library.title,
    sourceType: library.sourceType,
    location: library.location,
    methods: claimMethodsFor(library.sourceType),
    ownedByOther:
      library.ownerWorkspaceId !== null && library.ownerWorkspaceId !== workspaceId,
    ownedBySelf: library.ownerWorkspaceId === workspaceId,
    ownerName: owner,
  };
}

/** One claim as its claimant sees it, with the instructions to complete it. */
export interface ClaimantClaimView extends WorkspaceClaimRow {
  checks: ClaimCheckView[];
  /** The source address the instructions name, e.g. `owner/repository`. */
  location: string;
  /** Where the TXT record goes; null for the GitHub method or an unresolvable domain. */
  dnsRecordName: string | null;
  wellKnownUrl: string | null;
}

export async function claimForClaimant(
  workspaceId: string,
  claimId: string,
): Promise<ClaimantClaimView> {
  if (!isUuid(claimId)) throw notFound();
  const claim = await loadClaim(claimId);
  if (!claim || claim.claimantWorkspaceId !== workspaceId) throw notFound();

  const [library] = await db()
    .select({
      publicId: schema.library.publicId,
      title: schema.library.title,
      ownerWorkspaceId: schema.library.ownerWorkspaceId,
      ownerName,
      deletedAt: schema.library.deletedAt,
      sourceType: schema.source.type,
      location: schema.source.location,
    })
    .from(schema.library)
    .innerJoin(schema.source, eq(schema.source.libraryId, schema.library.id))
    .where(eq(schema.library.id, claim.libraryId))
    .orderBy(schema.source.id)
    .limit(1);
  if (!library || library.deletedAt) throw notFound();

  /*
   * A GitHub source's home domain is not stored, and the page is not the
   * place to ask GitHub for it; the instructions name the domain when it is
   * knowable from the source alone and otherwise describe where to look.
   */
  const domain =
    claim.method === 'github_permission'
      ? null
      : verificationDomain({ sourceType: library.sourceType, location: library.location });

  return {
    id: claim.id,
    libraryId: claim.libraryId,
    libraryPublicId: library.publicId,
    libraryTitle: library.title,
    method: claim.method,
    status: claim.status,
    failureReason: claim.failureReason,
    attempts: claim.attempts,
    expiresAt: claim.expiresAt,
    verifiedAt: claim.verifiedAt,
    createdAt: claim.createdAt,
    disputed: isDisputedClaim({
      status: claim.status,
      ownerWorkspaceId: library.ownerWorkspaceId,
      claimantWorkspaceId: claim.claimantWorkspaceId,
    }),
    ownerName: library.ownerName,
    location: library.location,
    checks: checkStates({
      method: claim.method,
      status: claim.status,
      failureReason: claim.failureReason,
      attempted: claim.attempts > 0,
    }),
    dnsRecordName: claim.method === 'dns_txt' && domain ? dnsRecordName(domain) : null,
    wellKnownUrl: claim.method === 'well_known' && domain ? wellKnownUrl(domain, claim.id) : null,
  };
}
