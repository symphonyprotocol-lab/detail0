import { AppError } from '@/contracts/errors';

/** ingestion use cases. Route Handlers and MCP tools may only enter through this layer. */
export function notImplemented(name: string): never {
  throw new AppError('not_implemented', `${name} is not implemented yet`);
}

export { buildVersion, type BuildOutcome } from './build-version';
export { publishVersion, type PublishResult } from './publish-version';
export {
  drainOperations,
  runOperation,
  MAX_ATTEMPTS,
  type OperationOutcome,
} from './run-operation';
export {
  defaultDependencies,
  isIngestionConfigured,
  memoryObjectStore,
  type IngestionDependencies,
} from './dependencies';
