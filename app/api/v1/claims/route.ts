import { AppError } from '@/contracts/errors';
import { errorResponse, newRequestId } from '@/lib/http/respond';

/**
 * POST /api/v1/claims — ownership claim
 * Route Handlers may only call lib/application use cases. architecture.md 4.
 */
export async function GET() {
  const requestId = newRequestId();
  return errorResponse(new AppError('not_implemented', 'POST /api/v1/claims — ownership claim is not implemented yet'), requestId);
}
