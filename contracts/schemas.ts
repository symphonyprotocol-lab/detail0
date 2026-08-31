import { z } from 'zod';

/**
 * Shared enums and payload schemas. Authoritative for REST, MCP, SDK and the web app.
 * Domain invariants live in lib/domain; this file is the wire contract only.
 */

// --- Library state. requirement.md 6.2: three independent axes, never merged. ---

export const visibilitySchema = z.enum(['public', 'private']);
export const lifecycleStatusSchema = z.enum([
  'draft',
  'submitted',
  'reviewing',
  'changes_requested',
  'published',
  'suspended',
  'archived',
]);
export const indexStatusSchema = z.enum([
  'pending',
  'processing',
  'ready',
  'failed',
  'stale',
  'deleting',
]);
export const claimStatusSchema = z.enum([
  'pending',
  'verified',
  'failed',
  'expired',
  'revoked',
]);

export const sourceTypeSchema = z.enum([
  'github',
  'website',
  'llms_txt',
  'markdown',
  'pdf',
  'openapi',
  'notion',
]);

/** requirement.md 7.3.2 */
export const claimMethodSchema = z.enum([
  'github_permission',
  'dns_txt',
  'well_known',
]);

/** requirement.md 6.4 */
export const anchorStatusSchema = z.enum(['pending', 'anchored', 'unavailable']);

// --- Library ID. requirement.md 6.1 ---

/** `/owner/repo`, `/websites/slug`, `/docs/slug`, `/notion/slug`, optional `/version`. */
export const libraryIdSchema = z
  .string()
  .regex(/^\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$/i, {
    message: 'library id must look like /owner/name or /owner/name/version',
  });

// --- Retrieval. Two-stage: resolve-library-id then query-docs. ---

/**
 * Query-first, name-optional. architecture.md 9.6 and 12.1: on a platform of
 * user-uploaded libraries the display name carries no routing signal, so the
 * caller passes the question and the server searches the content-derived
 * profile. `libraryName` survives as an optional hint for Context7-style
 * callers that do know a name.
 */
export const resolveLibraryInputSchema = z.object({
  query: z.string().min(1).max(2000),
  libraryName: z.string().min(1).max(200).optional(),
});

/**
 * Why this candidate matched. The library's name cannot be trusted to say so
 * (architecture.md 9.6), and without evidence the calling agent guesses --
 * a wrong pick plus a retry costs more than the bytes here ever will.
 */
export const candidateEvidenceSchema = z.object({
  matchedTitles: z.array(z.string()),
  matchedTerms: z.array(z.string()),
});

export const libraryCandidateSchema = z.object({
  libraryId: libraryIdSchema,
  title: z.string(),
  description: z.string().nullable(),
  version: z.string(),
  trustScore: z.number().int().min(0).max(100),
  benchmarkScore: z.number().int().min(0).max(100),
  chunks: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  evidence: candidateEvidenceSchema,
});

export const resolveLibraryOutputSchema = z.object({
  results: z.array(libraryCandidateSchema),
  requestId: z.string(),
});

export const queryDocsInputSchema = z.object({
  libraryId: libraryIdSchema,
  query: z.string().min(1).max(2000),
  maxTokens: z.number().int().min(256).max(64_000).default(4000),
  format: z.enum(['json', 'txt']).default('json'),
});

export const citationSchema = z.object({
  sourceUrl: z.string().url(),
  documentTitle: z.string(),
  section: z.string().nullable(),
  lines: z.tuple([z.number().int(), z.number().int()]).nullable(),
});

export const chunkResultSchema = z.object({
  chunkId: z.string(),
  text: z.string(),
  score: z.number(),
  tokens: z.number().int().nonnegative(),
  citation: citationSchema,
});

export const usageSchema = z.object({
  callsUsed: z.number().int().nonnegative(),
  planAllowanceRemaining: z.number().int().nonnegative(),
  addonBalanceRemaining: z.number().int().nonnegative(),
});

export const queryDocsOutputSchema = z.object({
  libraryId: libraryIdSchema,
  version: z.string(),
  chunks: z.array(chunkResultSchema),
  usage: usageSchema,
  requestId: z.string(),
});

// --- Claim. requirement.md 7.3 ---

export const startClaimInputSchema = z.object({
  libraryId: libraryIdSchema,
  method: claimMethodSchema,
});

export const claimChallengeSchema = z.object({
  claimId: z.string(),
  method: claimMethodSchema,
  status: claimStatusSchema,
  /** Only returned once, at creation. */
  challengeToken: z.string().optional(),
  dnsRecordName: z.string().optional(),
  dnsRecordValue: z.string().optional(),
  wellKnownUrl: z.string().url().optional(),
  expiresAt: z.string().datetime(),
});

export const claimCheckSchema = z.object({
  key: z.string(),
  label: z.string(),
  state: z.enum(['ok', 'pending', 'failed']),
});

export const verifyClaimOutputSchema = z.object({
  claimId: z.string(),
  status: claimStatusSchema,
  checks: z.array(claimCheckSchema),
  requestId: z.string(),
});

// --- Anchors. requirement.md 6.4. Never inlined into context responses. ---

export const anchorSchema = z.object({
  subjectType: z.enum(['version', 'audit_head', 'earning_statement']),
  subjectId: z.string(),
  status: anchorStatusSchema,
  network: z.string().nullable(),
  txHash: z.string().nullable(),
  blockTime: z.string().datetime().nullable(),
  leafSchemaVersion: z.number().int().nullable(),
});

export type ResolveLibraryInput = z.infer<typeof resolveLibraryInputSchema>;
export type ResolveLibraryOutput = z.infer<typeof resolveLibraryOutputSchema>;
export type QueryDocsInput = z.infer<typeof queryDocsInputSchema>;
export type QueryDocsOutput = z.infer<typeof queryDocsOutputSchema>;
export type LibraryCandidate = z.infer<typeof libraryCandidateSchema>;
export type ChunkResult = z.infer<typeof chunkResultSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type Usage = z.infer<typeof usageSchema>;
export type ClaimChallenge = z.infer<typeof claimChallengeSchema>;
export type VerifyClaimOutput = z.infer<typeof verifyClaimOutputSchema>;
export type Anchor = z.infer<typeof anchorSchema>;
