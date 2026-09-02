import type { UIMessage } from 'ai';

/**
 * The shape of the playground's UI message stream, shared by the route that
 * writes it and the transcript that reads it.
 *
 * A BFF contract, deliberately not in `contracts/`: architecture.md 9.5 keeps
 * generation out of /v1, and only this one page consumes these parts.
 *
 * There is no text part in the union, and that is the point. Model prose never
 * reaches the client as prose -- it arrives as `claim` parts the server has
 * already bound to a chunk of the same request (requirement.md 5.1 rule 5), so
 * nothing can be rendered as fact before it is citable.
 */

export interface PlaygroundSource {
  chunkId: string;
  sourceUrl: string;
  documentTitle: string;
  section: string | null;
}

export interface PlaygroundRouting {
  question: string;
  /** What resolve-library-id saw, so the transcript can show a real tool call. */
  candidates: { libraryId: string; title: string }[];
  libraryId: string | null;
  libraryTitle: string | null;
  version: string | null;
  requestId: string;
}

export type PlaygroundOutcome = 'answer' | 'degraded' | 'no_context' | 'no_library';

export type PlaygroundUIMessage = UIMessage<
  never,
  {
    routing: PlaygroundRouting;
    sources: { sources: PlaygroundSource[] };
    /** One bound sentence. `chunkIds` are its footnotes, in citation order. */
    claim: { claim: string; chunkIds: string[] };
    outcome: { kind: PlaygroundOutcome };
  }
>;
