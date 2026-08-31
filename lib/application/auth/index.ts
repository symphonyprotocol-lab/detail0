/** auth use cases. Route Handlers and MCP tools may only enter through this layer. */
export { hashApiKey, resolveApiKey, type ApiKeyPrincipal } from './api-key';
export { beginOAuth, type BeginOAuthInput, type BeginOAuthResult } from './begin-oauth';
export { completeOAuth, type CompleteOAuthInput, type CompleteOAuthResult } from './complete-oauth';
export {
  resolveSession,
  type SessionUser,
  type SessionWorkspace,
  type UserSession,
} from './resolve-session';
export { signOut } from './sign-out';
