/**
 * POST /api/playground -- the web playground's one exchange. architecture.md
 * 9.5 and 9.6: this is the server-side auto-routed entry -- the question goes
 * through the same resolve-library-id the MCP agent would call, the server
 * commits to the top candidate, and askPlayground does the rest through the
 * shared retrieval function. A BFF for the site, not part of /v1: the
 * response shape serves the transcript component and nothing else.
 *
 * Anonymous is the normal case here and rides the fail-closed anonymous rate
 * limit; a Bearer key works too and is then metered like any workspace call.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { AppError } from '@/contracts/errors';
import { resolveLibraryId } from '@/lib/application/retrieval';
import { askPlayground, type PlaygroundTranscript } from '@/lib/application/playground';
import { retrievalCaller } from '@/lib/http/retrieval-caller';
import { errorResponse, newRequestId } from '@/lib/http/respond';

export const runtime = 'nodejs';

const CANDIDATES_SHOWN = 3;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const caller = await retrievalCaller(request, requestId);

    let body: { question?: unknown };
    try {
      body = (await request.json()) as { question?: unknown };
    } catch {
      throw new AppError('invalid_request', 'the body must be JSON');
    }
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (question.length === 0 || question.length > 2_000) {
      throw new AppError('invalid_request', 'question is required (1-2000 characters)');
    }

    const resolved = await resolveLibraryId(caller, { query: question });
    const candidates = resolved.results
      .slice(0, CANDIDATES_SHOWN)
      .map((candidate) => ({ libraryId: candidate.libraryId, title: candidate.title }));

    if (resolved.results.length === 0) {
      const transcript: PlaygroundTranscript = {
        kind: 'no_library',
        question,
        candidates: [],
        libraryId: null,
        libraryTitle: null,
        version: null,
        text: null,
        citations: [],
        sources: [],
        requestId,
      };
      return NextResponse.json(transcript, { headers: { 'cache-control': 'private, no-store' } });
    }

    const top = resolved.results[0]!;
    const answered = await askPlayground(caller, { libraryId: top.libraryId, question });

    const transcript: PlaygroundTranscript = {
      kind: answered.kind,
      question,
      candidates,
      libraryId: top.libraryId,
      libraryTitle: top.title,
      version: top.version,
      text: answered.text,
      citations: answered.citations,
      sources: answered.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        sourceUrl: chunk.citation.sourceUrl,
        documentTitle: chunk.citation.documentTitle,
        section: chunk.citation.section,
      })),
      requestId,
    };
    return NextResponse.json(transcript, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
