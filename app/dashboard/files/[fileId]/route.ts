/**
 * An uploaded file, for the workspace that uploaded it.
 *
 * Citations of a PDF library point here (`lib/infrastructure/connectors/pdf.ts`)
 * because the object key is not a URL anyone can open. The handler finds the
 * `pdf` source whose config lists the file, checks the library belongs to
 * the signed-in workspace, and redirects to a short-lived presigned GET so
 * the bytes never proxy through the app (architecture.md 7). A file that is
 * not this workspace's is a 404, not a 403: the id is not to be confirmed.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { uploadedFilesOf } from '@/lib/domain/library';
import { currentSession } from '@/lib/http/session';
import { isObjectStoreConfigured, objectStore } from '@/lib/infrastructure/objects/store';
import { db, schema } from '@/lib/infrastructure/postgres/client';

const DOWNLOAD_TTL_SECONDS = 300;

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const session = await currentSession();
  if (!session) return new NextResponse(null, { status: 401 });

  const { fileId } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(fileId)) return new NextResponse(null, { status: 404 });

  const [row] = await db()
    .select({ config: schema.source.config })
    .from(schema.source)
    .innerJoin(schema.library, eq(schema.library.id, schema.source.libraryId))
    .where(
      and(
        eq(schema.source.type, 'pdf'),
        eq(schema.library.ownerWorkspaceId, session.workspace.id),
        isNull(schema.library.deletedAt),
        sql`${schema.source.config} @> ${JSON.stringify({ files: [{ id: fileId }] })}::jsonb`,
      ),
    )
    .limit(1);

  const file = row ? uploadedFilesOf(row.config).find((entry) => entry.id === fileId) : undefined;
  if (!file) return new NextResponse(null, { status: 404 });
  if (!isObjectStoreConfigured()) return new NextResponse(null, { status: 503 });

  return NextResponse.redirect(await objectStore().signedUrl(file.key, DOWNLOAD_TTL_SECONDS), {
    status: 302,
    headers: { 'cache-control': 'no-store' },
  });
}
