import { AppError } from '@/contracts/errors';
import { errorResponse, newRequestId } from '@/lib/http/respond';

/**
 * Remote MCP endpoint, stateless Streamable HTTP.
 *
 * Registers exactly two read-only tools, named identically everywhere:
 *   resolve-library-id
 *   query-docs
 *
 * Both delegate to lib/application/retrieval -- the same functions REST uses.
 * No authorization, recall or metering logic may be duplicated here.
 * architecture.md 13.1.
 */
export async function POST() {
  const requestId = newRequestId();
  return errorResponse(new AppError('not_implemented', 'MCP endpoint is not implemented yet'), requestId);
}

export async function GET() {
  const requestId = newRequestId();
  return errorResponse(new AppError('not_implemented', 'MCP endpoint is not implemented yet'), requestId);
}
