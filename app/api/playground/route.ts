/**
 * POST /api/playground -- the web playground's one exchange. architecture.md
 * 9.5 and 9.6: this is the server-side auto-routed entry -- the question goes
 * through the same resolve-library-id the MCP agent would call, the server
 * commits to the top candidate, and the generation path does the rest through
 * the shared retrieval function. A BFF for the site, not part of /v1: the
 * stream it writes serves the transcript component and nothing else.
 *
 * The response is an AI SDK UI message stream, but it carries no model text
 * part: every claim arrives as a `data-claim` the server has already bound to
 * a chunk of this request (requirement.md 5.1 rule 5). Piping the model's own
 * text stream through would put unbindable prose on screen and then take it
 * back, which is the thing that rule forbids.
 *
 * One exchange is one question. No history is replayed to the model -- rule 4
 * confines it to the chunks this request retrieved, and a transcript in the
 * prompt is exactly the outside knowledge that rule excludes.
 *
 * Which model runs is the console's decision, never the caller's: the body has
 * no model field, so a visitor cannot spend the platform's budget on the most
 * expensive entry configured.
 *
 * Anonymous is the normal case here and rides the fail-closed anonymous rate
 * limit; a Bearer key works too and is then metered like any workspace call.
 */
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AppError } from '@/contracts/errors';
import { resolveLibraryId } from '@/lib/application/retrieval';
import { streamPlayground } from '@/lib/application/playground';
import { retrievalCaller } from '@/lib/http/retrieval-caller';
import { errorResponse, newRequestId } from '@/lib/http/respond';
import type { PlaygroundUIMessage } from '@/lib/http/playground-stream';

export const runtime = 'nodejs';

const CANDIDATES_SHOWN = 3;

export async function POST(request: NextRequest): Promise<Response> {
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

    /*
     * Routing runs before the stream opens. It is one round trip and it
     * decides whether there is anything to stream at all, so a failure here
     * can still be an honest error response rather than a stream that opens
     * only to say nothing happened.
     */
    const resolved = await resolveLibraryId(caller, { query: question });
    const candidates = resolved.results
      .slice(0, CANDIDATES_SHOWN)
      .map((candidate) => ({ libraryId: candidate.libraryId, title: candidate.title }));
    const top = resolved.results[0] ?? null;

    const stream = createUIMessageStream<PlaygroundUIMessage>({
      execute: async ({ writer }) => {
        writer.write({ type: 'start' });
        writer.write({
          type: 'data-routing',
          data: {
            question,
            candidates,
            libraryId: top?.libraryId ?? null,
            libraryTitle: top?.title ?? null,
            version: top?.version ?? null,
            requestId,
          },
        });

        if (!top) {
          writer.write({ type: 'data-outcome', data: { kind: 'no_library' } });
          return;
        }

        try {
          for await (const event of streamPlayground(caller, {
            libraryId: top.libraryId,
            question,
          })) {
            if (event.type === 'context') {
              writer.write({
                type: 'data-sources',
                data: {
                  sources: event.chunks.map((chunk) => ({
                    chunkId: chunk.chunkId,
                    sourceUrl: chunk.citation.sourceUrl,
                    documentTitle: chunk.citation.documentTitle,
                    section: chunk.citation.section,
                  })),
                },
              });
            } else if (event.type === 'claim') {
              writer.write({
                type: 'data-claim',
                data: { claim: event.claim, chunkIds: event.chunkIds },
              });
            } else {
              writer.write({ type: 'data-outcome', data: { kind: event.kind } });
            }
          }
        } catch (error) {
          /*
           * Rule 6: the reader gets the chunks and a degraded notice, never an
           * error page -- and the stream is already open, so this is the only
           * place left to say so.
           */
          console.error(
            `playground stream failed: ${error instanceof Error ? error.message : 'unknown'}`,
          );
          writer.write({ type: 'data-outcome', data: { kind: 'degraded' } });
        }
      },
    });

    return createUIMessageStreamResponse({
      stream,
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch (error) {
    return errorResponse(error, requestId) as unknown as NextResponse;
  }
}
