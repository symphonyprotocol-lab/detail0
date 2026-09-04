import { AppError } from '@/contracts/errors';

/** libraries use cases. Route Handlers and MCP tools may only enter through this layer. */
export function notImplemented(name: string): never {
  throw new AppError('not_implemented', `${name} is not implemented yet`);
}

export {
  countWorkspaceLibraries,
  listWorkspaceLibraries,
  type WorkspaceLibraryRow,
} from './workspace';
export {
  countPublicLibraries,
  listPublicLibraries,
  publicLibraryDetail,
  type CatalogEntry,
  type PublicLibraryDetail,
} from './catalog';
export {
  createWorkspaceLibrary,
  type CreateWorkspaceLibraryInput,
  type CreateWorkspaceLibraryResult,
} from './create';
export {
  canDeleteLibraries,
  canManageApiKeys,
  canManageLibraries,
  deleteWorkspaceLibrary,
  markLibraryDeleted,
  DELETE_OPERATION,
  type DeleteLibraryResult,
  type DeleteWorkspaceLibraryInput,
  type WorkspaceRole,
} from './delete';
