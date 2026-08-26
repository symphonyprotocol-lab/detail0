/**
 * What each console list exports, in one place.
 *
 * The export control on a screen has to hand back the same rows the screen is
 * showing, so both read the same query with the same filters. Keeping the pair
 * in one descriptor is what stops them drifting -- an export that quietly
 * ignores the active filter is worse than no export.
 *
 * Headers are stable English keys rather than the operator's language: these
 * files are read by spreadsheets and scripts, and a column name that changes
 * with a cookie cannot be depended on.
 *
 * Only the lists that read the database are here. A screen still rendering
 * fixtures has nothing worth exporting, and a CSV of invented rows is worse
 * than no export at all -- it looks like a record.
 */
import type { AdminCapability } from '@/lib/domain/admin';
import { toCsv } from './csv';
import { listClaims, listUserLibraries, type ClaimFilter, type LibraryReviewFilter } from './list-libraries';
import { listConsoleUsers, type UserStatusFilter } from './list-users';
import { listAdministrators } from './manage-administrators';

export interface ExportRequest {
  query?: string;
  status?: string;
  limit?: number;
}

export interface ConsoleExport {
  capability: AdminCapability;
  /** Base of the downloaded filename; the date is appended at request time. */
  filename: string;
  build(input: ExportRequest): Promise<string>;
}

/** Exports are a full extract, not the first page the screen happens to show. */
const EXPORT_LIMIT = 10_000;

export const CONSOLE_EXPORTS: Record<string, ConsoleExport> = {
  users: {
    capability: 'users',
    filename: 'users',
    async build(input) {
      const { rows } = await listConsoleUsers({
        query: input.query,
        status: (input.status as UserStatusFilter) ?? 'all',
        limit: EXPORT_LIMIT,
      });
      return toCsv(
        ['name', 'email', 'plan', 'libraries', 'calls_this_month', 'signed_up', 'status'],
        rows.map((r) => [r.displayName, r.email, r.planName, r.libraries, r.callsThisMonth, r.joinedAt, r.status]),
      );
    },
  },
  libraries: {
    capability: 'libraries',
    filename: 'user-libraries',
    async build(input) {
      const { rows } = await listUserLibraries({
        query: input.query,
        review: (input.status as LibraryReviewFilter) ?? 'all',
        limit: EXPORT_LIMIT,
      });
      return toCsv(
        ['library_id', 'title', 'owner', 'source', 'storage_bytes', 'visibility', 'lifecycle_status', 'created'],
        rows.map((r) => [r.publicId, r.title, r.ownerName, r.sourceType, r.storageBytes, r.visibility, r.lifecycleStatus, r.createdAt]),
      );
    },
  },
  claims: {
    capability: 'libraries',
    filename: 'ownership-claims',
    async build(input) {
      const { rows } = await listClaims({
        query: input.query,
        status: (input.status as ClaimFilter) ?? 'all',
        limit: EXPORT_LIMIT,
      });
      return toCsv(
        ['library_id', 'library', 'claimant', 'method', 'opened', 'current_owner', 'status'],
        rows.map((r) => [r.libraryPublicId, r.libraryTitle, r.claimantName, r.method, r.openedAt, r.currentOwner, r.status]),
      );
    },
  },
  administrators: {
    capability: 'administrators',
    filename: 'administrators',
    async build(input) {
      const rows = await listAdministrators(input.query);
      return toCsv(
        ['name', 'email', 'roles', 'status', 'mfa_enrolled', 'last_active', 'active_sessions', 'created'],
        rows.map((r) => [r.username, r.email, r.roles.join(' '), r.status, r.mfaEnrolled, r.lastActiveAt, r.activeSessions, r.createdAt]),
      );
    },
  },
};

export function isExportableResource(value: string): value is keyof typeof CONSOLE_EXPORTS {
  return Object.hasOwn(CONSOLE_EXPORTS, value);
}
