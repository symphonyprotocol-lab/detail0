import {
  pgTable,
  pgEnum,
  text,
  uuid,
  integer,
  bigint,
  bigserial,
  boolean,
  timestamp,
  jsonb,
  vector,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Postgres schema. See architecture.md 6.
 *
 * Conventions (architecture.md 6.4):
 * - ids are application-generated UUIDv7
 * - timestamps are UTC
 * - money is an integer in the minor unit plus an ISO 4217 code, never a float
 */

// ---------------------------------------------------------------- enums

export const visibilityEnum = pgEnum('visibility', ['public', 'private']);
export const lifecycleStatusEnum = pgEnum('lifecycle_status', [
  'draft',
  'submitted',
  'reviewing',
  'changes_requested',
  'published',
  'suspended',
  'archived',
]);
export const indexStatusEnum = pgEnum('index_status', [
  'pending',
  'processing',
  'ready',
  'failed',
  'stale',
  'deleting',
]);
export const claimStatusEnum = pgEnum('claim_status', [
  'pending',
  'verified',
  'failed',
  'expired',
  'revoked',
]);
export const claimMethodEnum = pgEnum('claim_method', [
  'github_permission',
  'dns_txt',
  'well_known',
]);
export const sourceTypeEnum = pgEnum('source_type', [
  'github',
  'website',
  'llms_txt',
  'markdown',
  'pdf',
  'openapi',
  'notion',
]);
export const workspaceRoleEnum = pgEnum('workspace_role', [
  'owner',
  'admin',
  'developer',
  'viewer',
]);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'canceled',
  'trialing',
]);
export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',
  'committed',
  'released',
]);
export const anchorSubjectEnum = pgEnum('anchor_subject_type', [
  'version',
  'audit_head',
  'earning_statement',
]);
export const anchorBatchStatusEnum = pgEnum('anchor_batch_status', [
  'pending',
  'submitted',
  'confirmed',
  'failed',
  'superseded',
]);
export const settlementStatusEnum = pgEnum('settlement_status', [
  'accrued',
  'held',
  'paid',
  'clawed_back',
  'voided',
]);
export const policyModeEnum = pgEnum('policy_mode', ['quality', 'select']);

// ---------------------------------------------------------------- identity & commerce

/**
 * `email` is deliberately not unique: requirement.md 3.2 forbids merging
 * accounts that happen to share an address, so two providers reporting the
 * same mailbox stay two accounts until the user links them from a session.
 */
export const user = pgTable('user', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAccount = pgTable(
  'oauth_account',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => user.id),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('oauth_provider_subject_uq').on(t.provider, t.providerSubject)],
);

/**
 * Session digest. The cookie carries a random token; only its HMAC is stored,
 * the same "never keep the secret itself" rule the API keys follow.
 *
 * `client_summary` is a coarse fingerprint (user agent family only). Plain IPs
 * must not be written to product storage -- architecture.md 11.2.
 */
export const userSession = pgTable(
  'user_session',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => user.id),
    tokenHash: text('token_hash').notNull(),
    clientSummary: jsonb('client_summary').$type<Record<string, string>>().notNull().default({}),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_session_token_hash_uq').on(t.tokenHash),
    /** Suspending an account and counting its live sessions both read by user. */
    index('user_session_user_idx').on(t.userId),
  ],
);

export const workspace = pgTable('workspace', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  /** `personal` is the only kind in the MVP; team workspaces reuse the table. */
  kind: text('kind').notNull().default('personal'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMember = pgTable(
  'workspace_member',
  {
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
    userId: uuid('user_id').notNull().references(() => user.id),
    role: workspaceRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    /**
     * The primary key leads with `workspace_id`, so "which workspaces is this
     * user in" -- the direction every console screen asks -- cannot use it.
     */
    index('workspace_member_user_idx').on(t.userId),
  ],
);

export const apiKey = pgTable(
  'api_key',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
    name: text('name').notNull(),
    /** Only the hash is stored. The full value is shown once, at creation. */
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    lastFour: text('last_four').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    environment: text('environment').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('api_key_hash_uq').on(t.keyHash),
    /** Listing or counting a workspace's keys, which authentication never does. */
    index('api_key_workspace_idx').on(t.workspaceId),
  ],
);

export const plan = pgTable('plan', {
  /**
   * `free`, `pro` and `addon`, and nothing else. requirement.md 4.1, 4.3.
   *
   * Additional Calls is a pack, not a subscription tier: it has a Plan Version
   * so its price and calls-per-pack are versioned and frozen like the others,
   * but no `subscription` row may point at that version. See lib/domain/plans.
   */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const planVersion = pgTable('plan_version', {
  id: uuid('id').primaryKey(),
  planId: text('plan_id').notNull().references(() => plan.id),
  priceMinor: integer('price_minor').notNull(),
  currency: text('currency').notNull().default('USD'),
  monthlyCalls: integer('monthly_calls').notNull(),
  libraryLimit: integer('library_limit').notNull(),
  librarySizeBytesLimit: bigint('library_size_bytes_limit', { mode: 'number' }).notNull(),
  apiKeyLimit: integer('api_key_limit').notNull(),
  /** Publisher share rate, frozen per version. requirement.md 4.4 */
  shareRateBps: integer('share_rate_bps').notNull().default(2000),
  capabilities: jsonb('capabilities').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscription = pgTable('subscription', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  planVersionId: uuid('plan_version_id').notNull().references(() => planVersion.id),
  status: subscriptionStatusEnum('status').notNull(),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
});

/**
 * Additional Calls. requirement.md 4.3: the balance never expires and carries
 * across periods, so quota checks must read the balance and must not filter on
 * a validity window. See architecture.md 11.1.
 */
export const addonGrant = pgTable('addon_grant', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  callsGranted: integer('calls_granted').notNull(),
  callsConsumed: integer('calls_consumed').notNull().default(0),
  priceMinor: integer('price_minor').notNull(),
  currency: text('currency').notNull().default('USD'),
  providerOrderId: text('provider_order_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentEvent = pgTable(
  'payment_event',
  {
    id: uuid('id').primaryKey(),
    provider: text('provider').notNull(),
    externalEventId: text('external_event_id').notNull(),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payment_event_uq').on(t.provider, t.externalEventId)],
);

// ---------------------------------------------------------------- knowledge

export const library = pgTable(
  'library',
  {
    id: uuid('id').primaryKey(),
    /** Public, stable id such as /vercel/next.js. requirement.md 6.1 */
    publicId: text('public_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    domainTag: text('domain_tag'),
    language: text('language'),
    /**
     * Ownership. Written only by a verified claim or an admin ruling.
     * architecture.md 5.4 -- ingestion, review and refresh must never touch it.
     */
    ownerWorkspaceId: uuid('owner_workspace_id').references(() => workspace.id),
    isPlatformLibrary: boolean('is_platform_library').notNull().default(false),
    visibility: visibilityEnum('visibility').notNull(),
    lifecycleStatus: lifecycleStatusEnum('lifecycle_status').notNull(),
    indexStatus: indexStatusEnum('index_status').notNull(),
    currentVersionId: uuid('current_version_id'),
    storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull().default(0),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastSuccessfulRefreshAt: timestamp('last_successful_refresh_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('library_public_id_uq').on(t.publicId),
    index('library_owner_idx').on(t.ownerWorkspaceId),
    index('library_visibility_lifecycle_idx').on(t.visibility, t.lifecycleStatus),
  ],
);

export const libraryAlias = pgTable(
  'library_alias',
  {
    id: uuid('id').primaryKey(),
    fromPublicId: text('from_public_id').notNull(),
    libraryId: uuid('library_id').notNull().references(() => library.id),
  },
  (t) => [uniqueIndex('library_alias_uq').on(t.fromPublicId)],
);

export const source = pgTable('source', {
  id: uuid('id').primaryKey(),
  libraryId: uuid('library_id').notNull().references(() => library.id),
  type: sourceTypeEnum('type').notNull(),
  location: text('location').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  /** Encrypted reference only. Never the secret itself. */
  credentialRef: text('credential_ref'),
  refreshPolicy: jsonb('refresh_policy').$type<Record<string, unknown>>().notNull().default({}),
});

export const libraryVersion = pgTable('library_version', {
  id: uuid('id').primaryKey(),
  libraryId: uuid('library_id').notNull().references(() => library.id),
  label: text('label').notNull(),
  sourceDigest: text('source_digest').notNull(),
  parserVersion: text('parser_version').notNull(),
  chunkerVersion: text('chunker_version').notNull(),
  embeddingModel: text('embedding_model').notNull(),
  /** Merkle root over ordered chunk digests, input to Version Anchor. */
  contentMerkleRoot: text('content_merkle_root'),
  indexStatus: indexStatusEnum('index_status').notNull(),
  totalTokens: integer('total_tokens').notNull().default(0),
  totalChunks: integer('total_chunks').notNull().default(0),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const libraryReview = pgTable('library_review', {
  id: uuid('id').primaryKey(),
  libraryId: uuid('library_id').notNull().references(() => library.id),
  versionId: uuid('version_id').references(() => libraryVersion.id),
  stage: text('stage').notNull(),
  outcome: text('outcome'),
  feedback: jsonb('feedback').$type<string[]>().notNull().default([]),
  reviewerId: uuid('reviewer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

/**
 * Ownership claim. requirement.md 7.3, architecture.md 5.4.
 * A partial unique index keeps at most one pending claim per library.
 */
export const libraryClaim = pgTable(
  'library_claim',
  {
    id: uuid('id').primaryKey(),
    libraryId: uuid('library_id').notNull().references(() => library.id),
    claimantWorkspaceId: uuid('claimant_workspace_id').notNull().references(() => workspace.id),
    method: claimMethodEnum('method').notNull(),
    /** Hash only. The plaintext challenge is returned once, at creation. */
    challengeTokenHash: text('challenge_token_hash').notNull(),
    status: claimStatusEnum('status').notNull(),
    failureReason: text('failure_reason'),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    rulingAdminId: uuid('ruling_admin_id'),
    rulingReason: text('ruling_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('library_claim_pending_uq')
      .on(t.libraryId)
      .where(sql`${t.status} = 'pending'`),
    index('library_claim_claimant_idx').on(t.claimantWorkspaceId),
  ],
);

export const libraryScore = pgTable('library_score', {
  id: uuid('id').primaryKey(),
  libraryId: uuid('library_id').notNull().references(() => library.id),
  algorithmVersion: text('algorithm_version').notNull(),
  trustScore: integer('trust_score').notNull(),
  benchmarkScore: integer('benchmark_score').notNull(),
  breakdown: jsonb('breakdown').$type<Record<string, number>>().notNull().default({}),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const document = pgTable('document', {
  id: uuid('id').primaryKey(),
  libraryId: uuid('library_id').notNull().references(() => library.id),
  versionId: uuid('version_id').notNull().references(() => libraryVersion.id),
  title: text('title').notNull(),
  sourceUrl: text('source_url').notNull(),
  objectKey: text('object_key'),
});

/**
 * Chunk text, the full-text vector and the embedding live on one row so that
 * publishing is a single ACID transaction. architecture.md 1.2 and 8.3.
 */
export const chunk = pgTable(
  'chunk',
  {
    id: uuid('id').primaryKey(),
    libraryId: uuid('library_id').notNull().references(() => library.id),
    versionId: uuid('version_id').notNull().references(() => libraryVersion.id),
    documentId: uuid('document_id').notNull().references(() => document.id),
    ordinal: integer('ordinal').notNull(),
    body: text('body').notNull(),
    tokens: integer('tokens').notNull(),
    citation: jsonb('citation').$type<Record<string, unknown>>().notNull(),
    safetyStatus: text('safety_status').notNull().default('clean'),
    searchVector: text('search_vector'),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  (t) => [
    index('chunk_library_version_idx').on(t.libraryId, t.versionId),
    index('chunk_embedding_hnsw_idx').using(
      'hnsw',
      t.embedding.op('vector_cosine_ops'),
    ),
  ],
);

// ---------------------------------------------------------------- policy, usage, ops

export const policyVersion = pgTable('policy_version', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  mode: policyModeEnum('mode'),
  sourceTypes: jsonb('source_types').$type<Record<string, boolean>>().notNull().default({}),
  qualityFilters: jsonb('quality_filters').$type<Record<string, unknown>>().notNull().default({}),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const policyLibraryEntry = pgTable('policy_library_entry', {
  id: uuid('id').primaryKey(),
  policyVersionId: uuid('policy_version_id').notNull().references(() => policyVersion.id),
  kind: text('kind').notNull(),
  targetType: text('target_type').notNull(),
  targetValue: text('target_value').notNull(),
});

export const usageReservation = pgTable(
  'usage_reservation',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
    requestId: text('request_id').notNull(),
    status: reservationStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('usage_reservation_request_uq').on(t.requestId)],
);

export const usageEvent = pgTable(
  'usage_event',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
    requestId: text('request_id').notNull(),
    libraryId: uuid('library_id').references(() => library.id),
    versionId: uuid('version_id').references(() => libraryVersion.id),
    operation: text('operation').notNull(),
    entrypoint: text('entrypoint').notNull(),
    /** 'plan' or 'addon'. Recorded so billing disputes need no reconstruction. */
    debitSource: text('debit_source').notNull(),
    addonGrantId: uuid('addon_grant_id').references(() => addonGrant.id),
    statusCode: integer('status_code').notNull(),
    latencyMs: integer('latency_ms'),
    inputTokens: integer('input_tokens'),
    returnedTokens: integer('returned_tokens'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('usage_event_request_uq').on(t.requestId),
    index('usage_event_workspace_time_idx').on(t.workspaceId, t.createdAt),
  ],
);

export const usageSummary = pgTable(
  'usage_summary',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    bucketDate: timestamp('bucket_date', { withTimezone: true }).notNull(),
    calls: integer('calls').notNull().default(0),
  },
  (t) => [uniqueIndex('usage_summary_uq').on(t.workspaceId, t.bucketDate)],
);

export const publisherAccount = pgTable('publisher_account', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  providerAccountId: text('provider_account_id'),
  taxStatus: text('tax_status').notNull().default('pending'),
  agreementVersion: text('agreement_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Written in the same transaction as the usage event. architecture.md 11.4.
 * Requires the target library to have an owner, so unclaimed libraries earn nothing.
 */
export const earningEvent = pgTable(
  'earning_event',
  {
    id: uuid('id').primaryKey(),
    requestId: text('request_id').notNull(),
    libraryId: uuid('library_id').notNull().references(() => library.id),
    versionId: uuid('version_id').references(() => libraryVersion.id),
    ownerWorkspaceId: uuid('owner_workspace_id').notNull().references(() => workspace.id),
    planVersionId: uuid('plan_version_id').notNull().references(() => planVersion.id),
    shareRateBps: integer('share_rate_bps').notNull(),
    periodId: text('period_id').notNull(),
    flagged: boolean('flagged').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('earning_event_request_uq').on(t.requestId),
    index('earning_event_period_library_idx').on(t.periodId, t.libraryId),
  ],
);

export const revenuePeriod = pgTable(
  'revenue_period',
  {
    id: text('id').primaryKey(),
    netRevenueMinor: bigint('net_revenue_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('USD'),
    totalBilledCalls: bigint('total_billed_calls', { mode: 'number' }).notNull(),
    totalAttributableCalls: bigint('total_attributable_calls', { mode: 'number' }).notNull(),
    shareRateBps: integer('share_rate_bps').notNull(),
    poolMinor: bigint('pool_minor', { mode: 'number' }).notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
  },
);

export const settlement = pgTable('settlement', {
  id: uuid('id').primaryKey(),
  periodId: text('period_id').notNull().references(() => revenuePeriod.id),
  publisherAccountId: uuid('publisher_account_id').notNull().references(() => publisherAccount.id),
  libraryId: uuid('library_id').notNull().references(() => library.id),
  attributableCalls: bigint('attributable_calls', { mode: 'number' }).notNull(),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('USD'),
  status: settlementStatusEnum('status').notNull(),
  statementDigest: text('statement_digest'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payout = pgTable('payout', {
  id: uuid('id').primaryKey(),
  publisherAccountId: uuid('publisher_account_id').notNull().references(() => publisherAccount.id),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('USD'),
  providerReference: text('provider_reference'),
  status: text('status').notNull(),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- anchoring

export const anchorBatch = pgTable(
  'anchor_batch',
  {
    id: uuid('id').primaryKey(),
    subjectType: anchorSubjectEnum('subject_type').notNull(),
    leafSchemaVersion: integer('leaf_schema_version').notNull(),
    merkleRoot: text('merkle_root').notNull(),
    leafCount: integer('leaf_count').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    network: text('network').notNull(),
    txHash: text('tx_hash'),
    status: anchorBatchStatusEnum('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('anchor_batch_tx_uq').on(t.txHash)],
);

export const anchorLeaf = pgTable(
  'anchor_leaf',
  {
    id: uuid('id').primaryKey(),
    batchId: uuid('batch_id').notNull().references(() => anchorBatch.id),
    leafHash: text('leaf_hash').notNull(),
    leafSchemaVersion: integer('leaf_schema_version').notNull(),
    subjectType: anchorSubjectEnum('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    leafIndex: integer('leaf_index').notNull(),
    merkleProof: jsonb('merkle_proof').$type<string[]>(),
  },
  (t) => [
    uniqueIndex('anchor_leaf_subject_uq').on(
      t.subjectType,
      t.subjectId,
      t.leafSchemaVersion,
    ),
  ],
);

// ---------------------------------------------------------------- operations & admin

export const workflowOperation = pgTable(
  'workflow_operation',
  {
    id: uuid('id').primaryKey(),
    libraryId: uuid('library_id').references(() => library.id),
    operationType: text('operation_type').notNull(),
    sourceDigest: text('source_digest'),
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('workflow_operation_uq').on(t.libraryId, t.sourceDigest, t.operationType),
  ],
);

export const requestLog = pgTable('request_log', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspace.id),
  requestId: text('request_id').notNull(),
  operation: text('operation').notNull(),
  statusCode: integer('status_code').notNull(),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const report = pgTable('report', {
  id: uuid('id').primaryKey(),
  libraryId: uuid('library_id').notNull().references(() => library.id),
  reporterUserId: uuid('reporter_user_id').references(() => user.id),
  category: text('category').notNull(),
  detail: text('detail'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const administrator = pgTable(
  'administrator',
  {
    id: uuid('id').primaryKey(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    /**
     * Argon2id. Admin identity is separate from user OAuth (requirement.md 3.2).
     * Null until an invited administrator finishes enrolment -- a placeholder
     * hash would be a credential that exists but nobody chose.
     */
    passwordHash: text('password_hash'),
    /**
     * TOTP shared secret, sealed with `CREDENTIAL_ENCRYPTION_KEY` -- a plain
     * secret here would make the second factor worth exactly as much as the
     * password hash it sits next to.
     */
    mfaSecret: text('mfa_secret'),
    /**
     * Highest TOTP step already spent on a successful sign-in. A code is only
     * accepted strictly above it, so an observed code cannot be replayed inside
     * its own validity window (RFC 6238 5.2).
     */
    mfaLastCounter: bigint('mfa_last_counter', { mode: 'number' }),
    mfaEnrolledAt: timestamp('mfa_enrolled_at', { withTimezone: true }),
    /** `invited` until enrolment completes, then `active`, or `disabled`. */
    status: text('status').notNull().default('invited'),
    /**
     * Single-use enrolment secret, stored as a keyed digest like every other
     * token here, with a deadline so a forgotten invitation stops being a way in.
     */
    inviteTokenHash: text('invite_token_hash'),
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
    invitedBy: uuid('invited_by'),
    /** Reset on a successful sign-in; drives the lockout in lib/domain/admin. */
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('administrator_username_uq').on(t.username),
    uniqueIndex('administrator_email_uq').on(t.email),
    uniqueIndex('administrator_invite_token_uq').on(t.inviteTokenHash),
  ],
);

/**
 * Console session digest, deliberately a different table from `user_session`.
 *
 * Two authorities, two stores: a product session can never be presented as an
 * admin one and vice versa, whatever a cookie says (requirement.md 3.2).
 */
export const adminSession = pgTable(
  'admin_session',
  {
    id: uuid('id').primaryKey(),
    administratorId: uuid('administrator_id')
      .notNull()
      .references(() => administrator.id),
    tokenHash: text('token_hash').notNull(),
    clientSummary: jsonb('client_summary').$type<Record<string, string>>().notNull().default({}),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('admin_session_token_hash_uq').on(t.tokenHash)],
);

export const adminRole = pgTable('admin_role', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const adminPermission = pgTable(
  'admin_permission',
  {
    roleId: text('role_id').notNull().references(() => adminRole.id),
    capability: text('capability').notNull(),
    level: text('level').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.capability] })],
);

export const administratorRole = pgTable(
  'administrator_role',
  {
    administratorId: uuid('administrator_id').notNull().references(() => administrator.id),
    roleId: text('role_id').notNull().references(() => adminRole.id),
  },
  (t) => [primaryKey({ columns: [t.administratorId, t.roleId] })],
);

/**
 * Append only. The database role gets INSERT and SELECT, never UPDATE or DELETE.
 * prevHash/hash form the chain whose daily head is anchored. architecture.md 14.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    /**
     * Insertion order, and the only unambiguous way to find the chain head:
     * two entries can share `created_at` to the microsecond, and random uuids
     * give no tie-break.
     */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    administratorId: uuid('administrator_id').references(() => administrator.id),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    reason: text('reason'),
    beforeValue: jsonb('before_value'),
    afterValue: jsonb('after_value'),
    ipDigest: text('ip_digest'),
    result: text('result').notNull(),
    prevHash: text('prev_hash'),
    hash: text('hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('audit_log_hash_uq').on(t.hash),
    index('audit_log_time_idx').on(t.createdAt),
    /*
     * Declared because `seq DESC` is a read path, not just a write one: the
     * chain head is read under the writer's advisory lock on every append, and
     * the console lists the log in this order a page at a time. It exists in
     * the database from 0004; leaving it out here would let the next generated
     * migration drop it and turn both into a sort of the whole table.
     */
    index('audit_log_seq_idx').on(t.seq.desc()),
    /** One target's history, newest first -- how the console reads the log. */
    index('audit_log_target_idx').on(t.targetType, t.targetId, t.seq.desc()),
  ],
);
