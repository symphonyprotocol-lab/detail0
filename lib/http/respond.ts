import { NextResponse } from 'next/server';
import { AppError, httpStatusFor, type ApiErrorBody } from '@/contracts/errors';

/** Uniform error envelope for every REST route. architecture.md 17. */
export function errorResponse(error: unknown, requestId: string): NextResponse<ApiErrorBody> {
  const appError =
    error instanceof AppError ? error : new AppError('internal_error', 'unexpected error');

  /* Internal detail (config, driver messages) stays in the server log; the
     client only learns that something went wrong. */
  if (appError.code === 'internal_error') {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`internal error requestId=${requestId} detail=${detail}`);
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.code === 'internal_error' ? 'unexpected error' : appError.message,
      requestId,
      ...(appError.reason ? { reason: appError.reason } : {}),
    },
  };

  const status = httpStatusFor(appError.code);
  return NextResponse.json(body, {
    status,
    /* §12.2: 429 carries Retry-After. One minute is the coarse default; the
       precise window stays server side. */
    ...(status === 429 ? { headers: { 'retry-after': '60' } } : {}),
  });
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
