---
name: re0-knowledge-retrieval
description: Search Re0 knowledge libraries and retrieve concise, cited documentation context when a user needs source-grounded technical information.
---

# Re0 knowledge retrieval

Use Re0's read-only interfaces to find the right library and retrieve source-grounded context. Do not guess a library ID from its title: discovery is content-based and returns evidence for each candidate.

## Choose an interface

- Prefer the MCP server at `/mcp` when the client supports remote MCP. It exposes `resolve-library-id` and `query-docs` with their live JSON schemas.
- Otherwise use the REST endpoints below.
- To read a human-facing Re0 page with less noise, append `.md` before its query string. For example, read `/libraries.md?q=next.js` instead of scraping `/libraries?q=next.js`.

Anonymous access covers public libraries and is rate limited. Send `Authorization: Bearer <api-key>` to access libraries visible to a workspace or receive its larger allowance. A key needs `knowledge:search` for discovery and `knowledge:read` for retrieval.

## Search for a library

Call:

```http
GET /api/v1/libraries/search?query={query}&libraryName={optionalHint}
```

Parameters:

- `query` (required string, 1–2000 characters): the user's actual question or search intent.
- `libraryName` (optional string, 1–200 characters): a name hint only; never substitute it for `query`.

Choose a result using `evidence.matchedTitles`, `evidence.matchedTerms`, relevance to the request, and then trust/benchmark scores. Preserve the returned `libraryId` exactly. The catalogue webpage uses `q`, but this API uses `query`.

## Retrieve context

Call:

```http
GET /api/v1/context?libraryId={libraryId}&query={query}&maxTokens={maxTokens}&type={type}
```

Parameters:

- `libraryId` (required): an ID returned by search, such as `/owner/project`; a version suffix may pin a version.
- `query` (required string, 1–2000 characters): the focused information need.
- `maxTokens` (optional integer, 256–64000; default 4000): the maximum returned context size.
- `type` (optional `json` or `txt`; default `json`): use `txt` when compact model-ready context is sufficient; use `json` when structured citations, scores, token counts, or usage are needed.

Answer only from the returned chunks. Retain each chunk's source URL, document title, section, line range when present, and the response's library version. If no candidate or no relevant context is returned, say so rather than silently switching to an unrelated library.

## Errors and retries

REST failures use `{ "error": { "code", "message", "requestId", "reason"? } }`. Respect `Retry-After` on `429`. Ask the user for a key or narrower query when appropriate; do not bypass access rules, enumerate private IDs, or repeatedly retry authorization and quota failures.

