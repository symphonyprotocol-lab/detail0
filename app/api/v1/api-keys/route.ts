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
