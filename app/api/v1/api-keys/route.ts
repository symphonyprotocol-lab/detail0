import { AppError } from '@/contracts/errors';
import { errorResponse, newRequestId } from '@/lib/http/respond';

/**
 * POST /api/v1/api-keys — API key management
 * Route Handlers may only call lib/application use cases. architecture.md 4.
 */
export async function GET() {
  const requestId = newRequestId();
  return errorResponse(new AppError('not_implemented', 'POST /api/v1/api-keys — API key management is not implemented yet'), requestId);
}

/** The documented verb gets the same enveloped stub, not a bare 405. */
export { GET as POST };
