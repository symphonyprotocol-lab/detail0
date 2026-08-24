import { NextResponse } from 'next/server';
import { AppError, httpStatusFor, type ApiErrorBody } from '@/contracts/errors';

/** Uniform error envelope for every REST route. architecture.md 17. */
export function errorResponse(error: unknown, requestId: string): NextResponse<ApiErrorBody> {
  const appError =
    error instanceof AppError ? error : new AppError('internal_error', 'unexpected error');

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      requestId,
      ...(appError.reason ? { reason: appError.reason } : {}),
    },
  };

  return NextResponse.json(body, { status: httpStatusFor(appError.code) });
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
