import { AppError } from '@/contracts/errors';
import { errorResponse, newRequestId } from '@/lib/http/respond';

/**
 * GET /api/v1/anchors — anchor status and proof
 * Route Handlers may only call lib/application use cases. architecture.md 4.
 */
export async function GET() {
  const requestId = newRequestId();
  return errorResponse(new AppError('not_implemented', 'GET /api/v1/anchors — anchor status and proof is not implemented yet'), requestId);
}
