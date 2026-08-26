import { AppError } from '@/contracts/errors';

/** administration use cases. Route Handlers and MCP tools may only enter through this layer. */
export function notImplemented(name: string): never {
  throw new AppError('not_implemented', `${name} is not implemented yet`);
}

export {
  signInAdmin,
  revokeAdminSession,
  rolesFor,
  type SignInAdminInput,
  type SignInAdminResult,
} from './sign-in-admin';
export { resolveAdminSession, type AdminSession } from './resolve-admin-session';
export { recordAudit, originDigest, auditHash, type AuditEntry } from './audit';
export { hashAdminPassword, verifyAdminPassword } from './password';
export { adminSessionTokenHash } from './admin-session-token';
export { CONSOLE_EXPORTS, isExportableResource, type ExportRequest } from './console-exports';
export { toCsv, csvCell } from './csv';
export { qrCodeSvg } from './qr-code';
export { listConsoleUsers, type ConsoleUserRow, type UserStatusFilter } from './list-users';
export {
  listUserLibraries,
  listClaims,
  type ConsoleLibraryRow,
  type ConsoleClaimRow,
  type LibraryReviewFilter,
  type ClaimFilter,
} from './list-libraries';
export {
  listAdministrators,
  inviteAdministrator,
  changeAdministratorRole,
  setAdministratorStatus,
  revokeAdministratorSessions,
  offerEnrolment,
  completeEnrolment,
  type AdministratorRow,
  type InviteResult,
  type EnrolmentOffer,
} from './manage-administrators';
