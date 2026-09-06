/**
 * An uploaded file of a platform library, for a signed-in administrator.
 *
 * The console's files panel links here so an operator can open a draft's
 * PDF before the library is published. It lives under `/admin` because the
 * administrator session cookie is scoped to that path (requirement.md 3.2):
 * the public `/files/[fileId]` never sees it, and only serves published
 * libraries. Same lookup, same short-lived signed redirect; a file that is
 * not a platform library's is a 404 rather than a 403.
 */
import { NextResponse } from 'next/server';
import { currentAdminSession } from '@/lib/http/admin';
import { platformFileRedirect } from '@/lib/http/platform-file';

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  if (!(await currentAdminSession())) return new NextResponse(null, { status: 404 });
  const { fileId } = await context.params;
  return platformFileRedirect(fileId, { includeUnpublished: true });
}
