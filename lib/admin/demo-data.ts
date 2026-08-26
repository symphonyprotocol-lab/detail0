/**
 * Placeholder data for the admin console -- design source frames `oxEhj`,
 * `SRtSN`, `zcHnx`, `d5LpW4`, `WHlyq`, `n7LZMz`, `RubCg`, `Uko79`, `buNhV`
 * and `z9DJOF`.
 *
 * Administration use cases are not implemented yet (architecture.md 21), so
 * these screens render from this fixture. The shapes mirror db/schema.ts --
 * `administrator`, `audit_log`, `library_review`, `library_claim`,
 * `plan_version`, `payment_event` and `settlement` -- closely enough that each
 * block can be swapped for a query one at a time.
 *
 * Same split as `lib/dashboard/demo-data`: numbers, ids and enum values are
 * facts and live here; the words that label them live in the dictionaries
 * under `adminDemo`. `adminCopy()` assembles the two for one language.
 */
import { ADMIN_CAPABILITIES, roleAllows, type AdminCapability, type AdminRoleId } from '@/lib/domain/admin';
import type { Dictionary } from '@/lib/i18n/dictionary';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    return parts
      .slice(0, 2)
      .map((part) => (Array.from(part)[0] ?? '').toUpperCase())
      .join('');
  }
  return Array.from(name).slice(0, 2).join('').toUpperCase();
}

/* --------------------------------------------------------------- overview */

export interface AdminStat {
  label: string;
  value: string;
  /** Period-over-period move, or a caption when there is nothing to compare. */
  delta?: string;
  deltaTone?: 'up' | 'flat';
  caption?: string;
}

/** Thirteen days of sign-ups; the design labels every other point. */
const GROWTH_VOLUME: [number, number][] = [
  [96, 18],
  [118, 22],
  [104, 19],
  [142, 27],
  [156, 31],
  [138, 30],
  [184, 39],
  [206, 44],
  [192, 43],
  [238, 52],
  [261, 58],
  [246, 57],
  [302, 68],
];

export const GROWTH_SCALE_MAX = 320;

export interface GrowthPoint {
  /** Only every other point carries an axis label, as in the design. */
  label?: string;
  users: number;
  paid: number;
}

export type ActivityTone = 'brand' | 'neutral' | 'amber' | 'rose';

export interface ActivityEntry {
  title: string;
  meta: string;
  when: string;
  tone: ActivityTone;
}

export interface HealthRow {
  label: string;
  value: string;
  /** Meter fill, 0..100. */
  percent: number;
}

/* ------------------------------------------------------------------ users */

export type AccountStatus = 'active' | 'suspended';

export interface AdminUserRow {
  name: string;
  email: string;
  initial: string;
  plan: 'Free' | 'Pro';
  libraries: number;
  calls: number;
  joinedAt: string;
  status: AccountStatus;
  statusLabel: string;
}

export const USER_TOTAL = 12_846;

/* -------------------------------------------------------------- libraries */

export type LibraryReviewStatus = 'pending' | 'approved' | 'rejected' | 'exempt';

export interface AdminLibraryRow {
  title: string;
  meta: string;
  owner: string;
  source: string;
  size: string;
  scope: 'public' | 'private';
  scopeLabel: string;
  status: LibraryReviewStatus;
  statusLabel: string;
}

export const LIBRARY_TOTAL = 5;

/* ----------------------------------------------------------------- claims */

export type ClaimStatus = 'pending' | 'claimed' | 'disputed' | 'expired' | 'revoked';

export interface AdminClaimRow {
  title: string;
  meta: string;
  applicant: string;
  method: string;
  startedAt: string;
  owner: string;
  status: ClaimStatus;
  statusLabel: string;
}

export const CLAIM_TOTAL = 6;

/* ------------------------------------------------- platform libraries */

export type PlatformStatus = 'published' | 'syncing' | 'draft';

export interface PlatformLibraryRow {
  title: string;
  meta: string;
  source: string;
  documents: string;
  size: string;
  syncedAt: string;
  status: PlatformStatus;
  statusLabel: string;
}

export const PLATFORM_TOTAL = 126;

/* ------------------------------------------------------------------ plans */

export interface PlanCard {
  id: 'free' | 'pro' | 'addon';
  name: string;
  tagline: string;
  price: string;
  /** Free and Pro are monthly; the call pack is a one-off purchase. */
  period?: string;
  perks: string[];
  featured?: boolean;
  /** Rendered on the console's dark card, as the design draws the pack. */
  dark?: boolean;
}

export interface QuotaRow {
  label: string;
  free: string;
  pro: string;
  addon: string;
}

/* ---------------------------------------------------------------- billing */

export type InvoiceStatus = 'due' | 'paid' | 'refunded';

export interface InvoiceRow {
  number: string;
  customer: string;
  plan: string;
  amount: string;
  date: string;
  method: string;
  status: InvoiceStatus;
  statusLabel: string;
}

export const INVOICE_TOTAL = 1_864;

/* ------------------------------------------------------------ settlements */

export type StatementStatus = 'held' | 'paid' | 'clawback';

export interface StatementRow {
  number: string;
  publisher: string;
  library: string;
  calls: string;
  period: string;
  amount: string;
  status: StatementStatus;
  statusLabel: string;
}

export const STATEMENT_TOTAL = 4;

/* --------------------------------------------------------- administrators */

export type AdminAccountStatus = 'active' | 'invited' | 'disabled';

export interface AdministratorRow {
  name: string;
  email: string;
  initial: string;
  role: string;
  scope: string;
  lastActive: string;
  status: AdminAccountStatus;
  statusLabel: string;
}

/**
 * The permission matrix is not restated here: `lib/domain/admin` is the single
 * source that both this screen and the server-side capability checks read, so
 * the table cannot drift away from what the console actually enforces.
 */
export type Capability = AdminCapability;

export const CAPABILITIES = ADMIN_CAPABILITIES;

const MATRIX_ROLES: readonly AdminRoleId[] = ['super', 'operator', 'reviewer', 'support'];

export interface RoleRow {
  role: string;
  allowed: Record<Capability, boolean>;
}

/* -------------------------------------------------------------- audit log */

export interface AuditRow {
  time: string;
  admin: string;
  action: string;
  target: string;
  /**
   * A digest, never the address itself: plain IPs must not reach product
   * storage (requirement.md 12, architecture.md 11.2), and `audit_log` keeps
   * `ip_digest` for exactly that reason.
   */
  originDigest: string;
  result: 'success' | 'failure';
  resultLabel: string;
}

export const AUDIT_TOTAL = 3_182;

/* ------------------------------------------------------------------------ */

/** Every string-bearing fixture, resolved for one language. */
export function adminCopy(t: Dictionary) {
  const d = t.adminDemo;
  // Role names are production copy, shared with the console header.
  const roles = t.admin.roles;

  const stats: AdminStat[] = [
    { label: d.stats.users, value: '12,846', delta: '12.8%', deltaTone: 'up' },
    { label: d.stats.libraries, value: '38,291', delta: '8.4%', deltaTone: 'up' },
    { label: d.stats.pending, value: '2', caption: d.stats.pendingCaption },
    { label: d.stats.revenue, value: '$19,240', delta: '16.2%', deltaTone: 'up' },
  ];

  const growth: GrowthPoint[] = GROWTH_VOLUME.map(([users, paid], index) => ({
    ...(index % 2 === 0 ? { label: d.growthDays[index / 2] ?? '' } : {}),
    users,
    paid,
  }));

  const activityTones: ActivityTone[] = ['brand', 'neutral', 'amber', 'rose'];
  const activity: ActivityEntry[] = d.activity.map((entry, index) => ({
    ...entry,
    tone: activityTones[index] ?? 'neutral',
  }));

  const health: HealthRow[] = [
    { label: d.health.api, value: '99.99%', percent: 100 },
    { label: d.health.index, value: '99.94%', percent: 100 },
    { label: d.health.payment, value: '100%', percent: 100 },
    { label: d.health.queue, value: d.health.queueValue, percent: 38 },
  ];

  const userFacts: [AdminUserRow['plan'], number, number, string, AccountStatus][] = [
    ['Pro', 12, 18_420, '2026-06-05', 'active'],
    ['Free', 4, 682, '2026-07-18', 'active'],
    ['Pro', 19, 42_108, '2026-05-22', 'active'],
    ['Free', 2, 104, '2026-08-02', 'suspended'],
    ['Pro', 23, 24_860, '2026-03-11', 'active'],
  ];

  const users: AdminUserRow[] = d.users.map((user, index) => {
    const [plan, libraries, calls, joinedAt, status] = userFacts[index] ?? userFacts[0]!;
    return {
      ...user,
      initial: initials(user.name),
      plan,
      libraries,
      calls,
      joinedAt,
      status,
      statusLabel: status === 'active' ? d.userStatus.active : d.userStatus.suspended,
    };
  });

  const libraryFacts: [string, string, AdminLibraryRow['scope'], LibraryReviewStatus][] = [
    ['GitHub', '18.6 MB', 'public', 'pending'],
    ['Notion', '62.4 MB', 'public', 'pending'],
    ['OpenAPI', '31.8 MB', 'public', 'approved'],
    ['Markdown', '4.3 MB', 'private', 'exempt'],
    ['Website', '19.2 MB', 'public', 'rejected'],
  ];

  const libraries: AdminLibraryRow[] = d.libraries.map((library, index) => {
    const [source, size, scope, status] = libraryFacts[index] ?? libraryFacts[0]!;
    return {
      ...library,
      source,
      size,
      scope,
      scopeLabel: scope === 'public' ? d.scope.public : d.scope.private,
      status,
      statusLabel: d.reviewStatus[status],
    };
  });

  const libraryTabs = [
    { id: 'all', label: t.admin.libraries.tabs.all, count: 5, href: '/admin/libraries' },
    { id: 'pending', label: t.admin.libraries.tabs.pending, count: 2 },
    { id: 'approved', label: t.admin.libraries.tabs.approved },
    { id: 'rejected', label: t.admin.libraries.tabs.rejected },
    { id: 'claims', label: t.admin.libraries.tabs.claims, count: 1, href: '/admin/claims' },
  ];

  const claimFacts: [keyof typeof d.claimMethod, string | null, ClaimStatus][] = [
    ['githubPermission', null, 'pending'],
    ['dnsTxt', 'Yuzhao', 'disputed'],
    ['wellKnown', 'Nova Labs', 'claimed'],
    ['githubPermission', null, 'expired'],
    ['dnsTxt', null, 'revoked'],
  ];

  const claims: AdminClaimRow[] = d.claims.map((claim, index) => {
    const [method, owner, status] = claimFacts[index] ?? claimFacts[0]!;
    return {
      ...claim,
      method: d.claimMethod[method],
      owner: owner ?? d.unclaimed,
      status,
      statusLabel: d.claimStatus[status],
    };
  });

  const claimTabs = [
    { id: 'all', label: t.admin.claims.tabs.all, count: 6 },
    { id: 'pending', label: t.admin.claims.tabs.pending, count: 2 },
    { id: 'claimed', label: t.admin.claims.tabs.claimed },
    { id: 'revoked', label: t.admin.claims.tabs.revoked },
    { id: 'disputed', label: t.admin.claims.tabs.disputed, count: 1 },
  ];

  const platformStats: AdminStat[] = [
    { label: d.platformStats.published, value: '126' },
    { label: d.platformStats.synced, value: '12' },
    { label: d.platformStats.calls, value: '8.6M' },
  ];

  const platformFacts: [string, string, string, PlatformStatus][] = [
    ['Website', '2,418', '84.2 MB', 'published'],
    ['GitHub', '1,206', '46.8 MB', 'published'],
    ['OpenAPI', '986', '38.1 MB', 'syncing'],
    ['Website', '3,642', '126.7 MB', 'draft'],
  ];

  const platformLibraries: PlatformLibraryRow[] = d.platformLibraries.map((library, index) => {
    const [source, documents, size, status] = platformFacts[index] ?? platformFacts[0]!;
    return {
      ...library,
      source,
      documents,
      size,
      status,
      statusLabel: d.platformStatus[status],
    };
  });

  const plans: PlanCard[] = [
    {
      id: 'free',
      name: 'Free',
      tagline: d.plans.free.tagline,
      price: '$0',
      period: d.plans.perMonth,
      perks: [...d.plans.free.perks],
    },
    {
      id: 'pro',
      name: 'Pro',
      tagline: d.plans.pro.tagline,
      price: '$5',
      period: d.plans.perMonth,
      perks: [...d.plans.pro.perks],
      featured: true,
    },
    {
      id: 'addon',
      name: 'Additional Calls',
      tagline: d.plans.addon.tagline,
      price: d.plans.addon.price,
      perks: [...d.plans.addon.perks],
      dark: true,
    },
  ];

  const quotaRows: QuotaRow[] = d.quotaRows.map((row) => ({
    label: row.label,
    free: row.free,
    pro: row.pro,
    addon: 'addon' in row && row.addon ? row.addon : d.plans.inherit,
  }));

  const billingStats: AdminStat[] = [
    { label: d.billingStats.revenue, value: '$19,240', caption: d.billingStats.revenueCaption },
    { label: d.billingStats.active, value: '1,864', caption: d.billingStats.activeCaption },
    { label: d.billingStats.due, value: '$1,240', caption: d.billingStats.dueCaption },
    { label: d.billingStats.refund, value: '0.42%', caption: d.billingStats.refundCaption },
  ];

  const invoiceFacts: [keyof typeof d.invoicePlan, string, InvoiceStatus][] = [
    ['pro', '$5.00', 'due'],
    ['addon', '$5.00', 'paid'],
    ['pro', '$5.00', 'paid'],
    ['pro', '$5.00', 'refunded'],
  ];

  const invoices: InvoiceRow[] = d.invoices.map((invoice, index) => {
    const [plan, amount, status] = invoiceFacts[index] ?? invoiceFacts[0]!;
    return {
      ...invoice,
      plan: d.invoicePlan[plan],
      amount,
      method: d.invoiceMethod.card,
      status,
      statusLabel: d.invoiceStatus[status],
    };
  });

  const settlementStats: AdminStat[] = [
    { label: d.settlementStats.net, value: '$18,420', caption: d.settlementStats.netCaption },
    { label: d.settlementStats.pool, value: '$2,214', caption: d.settlementStats.poolCaption },
    { label: d.settlementStats.due, value: '$1,586', caption: d.settlementStats.dueCaption },
    {
      label: d.settlementStats.clawback,
      value: '$63.20',
      caption: d.settlementStats.clawbackCaption,
    },
  ];

  const statementFacts: [string, string, StatementStatus][] = [
    ['18,240', '$45.60', 'held'],
    ['12,905', '$32.26', 'paid'],
    ['9,470', '$23.68', 'paid'],
    ['6,120', '−$15.30', 'clawback'],
  ];

  const statements: StatementRow[] = d.settlements.map((statement, index) => {
    const [calls, amount, status] = statementFacts[index] ?? statementFacts[0]!;
    return {
      ...statement,
      calls,
      amount,
      status,
      statusLabel: d.settlementStatus[status],
    };
  });

  const administratorFacts: [AdminRoleId, AdminAccountStatus][] = [
    ['super', 'active'],
    ['reviewer', 'active'],
    ['operator', 'active'],
    ['support', 'invited'],
  ];

  const administrators: AdministratorRow[] = d.administrators.map((administrator, index) => {
    const [role, status] = administratorFacts[index] ?? administratorFacts[0]!;
    return {
      ...administrator,
      initial: initials(administrator.name),
      role: roles[role],
      status,
      statusLabel: d.adminStatus[status],
    };
  });

  const roleMatrix: RoleRow[] = MATRIX_ROLES.map((role) => ({
    role: roles[role],
    allowed: Object.fromEntries(
      CAPABILITIES.map((capability) => [capability, roleAllows(role, capability)]),
    ) as Record<Capability, boolean>,
  }));

  const auditFacts: [string, AuditRow['result']][] = [
    ['9f21…c4a1', 'success'],
    ['3ba7…10de', 'success'],
    ['3ba7…77c2', 'success'],
    ['9f21…c4a1', 'success'],
    ['e408…5b93', 'failure'],
  ];

  const auditEntries: AuditRow[] = d.auditEntries.map((entry, index) => {
    const [originDigest, result] = auditFacts[index] ?? auditFacts[0]!;
    return {
      ...entry,
      originDigest,
      result,
      resultLabel: result === 'success' ? d.auditResult.success : d.auditResult.failure,
    };
  });

  return {
    stats,
    growth,
    growthNewUsers: '2,184',
    growthConversion: '7.8%',
    pendingQueue: d.pendingQueue,
    activity,
    health,
    users,
    libraries,
    libraryTabs,
    claims,
    claimTabs,
    platformStats,
    platformLibraries,
    plans,
    quotaRows,
    billingStats,
    invoices,
    settlementStats,
    statements,
    administrators,
    roleMatrix,
    capabilityLabels: d.capabilities,
    anchorDigest: d.anchorDigest,
    auditEntries,
  };
}

/** Badge on the console rail: public libraries waiting for a decision. */
export const PENDING_REVIEWS = 2;
