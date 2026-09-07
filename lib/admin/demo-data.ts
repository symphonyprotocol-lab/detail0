/**
 * Placeholder data for the admin console -- design source frames `SRtSN`,
 * `zcHnx`, `WHlyq`, `RubCg`, `Uko79`, `buNhV` and `z9DJOF`.
 *
 * Most console screens now read their own use case; what is left here is the
 * fixture behind the screens whose use cases are not built yet (architecture.md
 * 21), settlements first among them. The shapes mirror db/schema.ts --
 * `administrator`, `audit_log`, `library_review`, `library_claim`,
 * `plan_version`, `payment_event` and `settlement` -- closely enough that each
 * block can be swapped for a query one at a time. The overview (`oxEhj`) was
 * the last of its blocks to go: `lib/application/administration/overview`.
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

/* ------------------------------------------------------------------ stats */

export interface AdminStat {
  label: string;
  value: string;
  /** Period-over-period move, or a caption when there is nothing to compare. */
  delta?: string;
  deltaTone?: 'up' | 'flat';
  caption?: string;
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

/* ------------------------------------------------------------------------ */

/** Every string-bearing fixture, resolved for one language. */
export function adminCopy(t: Dictionary) {
  const d = t.adminDemo;
  // Role names are production copy, shared with the console header.
  const roles = t.admin.roles;

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
      statusLabel: t.admin.statuses[status],
    };
  });

  const roleMatrix: RoleRow[] = MATRIX_ROLES.map((role) => ({
    role: roles[role],
    allowed: Object.fromEntries(
      CAPABILITIES.map((capability) => [capability, roleAllows(role, capability)]),
    ) as Record<Capability, boolean>,
  }));

  return {
    users,
    libraries,
    libraryTabs,
    claims,
    claimTabs,
    settlementStats,
    statements,
    administrators,
    roleMatrix,
    capabilityLabels: t.admin.capabilities,
  };
}
