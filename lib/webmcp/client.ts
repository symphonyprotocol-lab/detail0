/**
 * The browser-side WebMCP adapter deliberately speaks to our existing remote
 * MCP endpoint. The browser widget is transport only; tool definitions,
 * validation, authorization, metering and execution remain owned by /mcp.
 */

export interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface WebMcpToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface JsonRpcResponse<T> {
  jsonrpc?: string;
  id?: string;
  result?: T;
  error?: { code?: number; message?: string };
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function rpc<T>(
  method: string,
  params: Record<string, unknown> | undefined,
  fetcher: Fetcher,
): Promise<T> {
  const response = await fetcher('/mcp', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'webmcp',
      method,
      ...(params ? { params } : {}),
    }),
  });

  let payload: JsonRpcResponse<T>;
  try {
    payload = (await response.json()) as JsonRpcResponse<T>;
  } catch {
    throw new Error(`MCP endpoint returned HTTP ${response.status}`);
  }

  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message ?? `MCP endpoint returned HTTP ${response.status}`);
  }
  return payload.result;
}

/** Discover tools at runtime so WebMCP can never drift from the remote MCP API. */
export async function listWebMcpTools(fetcher: Fetcher = fetch): Promise<WebMcpToolDefinition[]> {
  const result = await rpc<{ tools?: unknown }>('tools/list', undefined, fetcher);
  if (!Array.isArray(result.tools)) throw new Error('MCP endpoint returned an invalid tool list');

  return result.tools.filter((tool): tool is WebMcpToolDefinition => {
    if (!tool || typeof tool !== 'object') return false;
    const candidate = tool as Partial<WebMcpToolDefinition>;
    return (
      typeof candidate.name === 'string' &&
      typeof candidate.description === 'string' &&
      Boolean(candidate.inputSchema) &&
      typeof candidate.inputSchema === 'object'
    );
  });
}

/** Execute through /mcp and preserve MCP's successful and tool-error results. */
export function callWebMcpTool(
  name: string,
  args: Record<string, unknown>,
  fetcher: Fetcher = fetch,
): Promise<WebMcpToolResult> {
  return rpc<WebMcpToolResult>('tools/call', { name, arguments: args }, fetcher);
}
