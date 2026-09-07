/**
 * `re0 setup` / `re0 remove` file edits, as decisions. requirement.md 9.4:
 * every generated configuration is shown before it is written, and `remove`
 * deletes only what re0 created. The edits are pure functions over the
 * file's text, so this suite needs no home directory.
 */
import { describe, expect, it } from 'vitest';
import {
  CLIENTS,
  CLIENT_IDS,
  SERVER_NAME,
  clientById,
  type Connection,
} from '../../packages/cli/src/clients';
import { parseArgs } from '../../packages/cli/src/index';

const url = 'https://re0.com/mcp';
const keyed: Connection = { url, apiKey: 're0_test_key' };
const anonymous: Connection = { url };

describe('json clients', () => {
  for (const id of ['claude-code', 'cursor', 'claude-desktop'] as const) {
    const client = clientById(id);

    it(`${id}: adds one entry to an empty file and takes it out again`, () => {
      const written = client.setup('', keyed);
      const parsed = JSON.parse(written) as { mcpServers: Record<string, unknown> };
      expect(Object.keys(parsed.mcpServers)).toEqual([SERVER_NAME]);
      expect(client.hasEntry(written)).toBe(true);
      expect(client.remove(written)).toBe('{\n  "mcpServers": {}\n}\n');
    });

    it(`${id}: leaves other servers and top-level keys alone`, () => {
      const existing = JSON.stringify(
        { theme: 'dark', mcpServers: { other: { command: 'x' } } },
        null,
        2,
      );
      const written = client.setup(existing, anonymous);
      const parsed = JSON.parse(written) as { theme: string; mcpServers: Record<string, unknown> };
      expect(parsed.theme).toBe('dark');
      expect(parsed.mcpServers.other).toEqual({ command: 'x' });
      expect(parsed.mcpServers[SERVER_NAME]).toBeDefined();
      const removed = JSON.parse(client.remove(written)) as { mcpServers: Record<string, unknown> };
      expect(removed.mcpServers).toEqual({ other: { command: 'x' } });
    });

    it(`${id}: refuses a file that does not parse rather than replacing it`, () => {
      expect(() => client.setup('{ not json', keyed)).toThrow(/not valid JSON/);
      expect(() => client.setup('[]', keyed)).toThrow(/JSON object/);
      expect(client.hasEntry('{ not json')).toBe(false);
    });

    it(`${id}: remove is a no-op without an entry`, () => {
      expect(client.remove('{"mcpServers":{"other":{}}}')).toBe('{"mcpServers":{"other":{}}}');
    });
  }

  it('claude-code writes an http server with the bearer header only when keyed', () => {
    const client = clientById('claude-code');
    const keyedEntry = (JSON.parse(client.setup('', keyed)) as { mcpServers: Record<string, unknown> }).mcpServers[SERVER_NAME];
    expect(keyedEntry).toEqual({ type: 'http', url, headers: { Authorization: 'Bearer re0_test_key' } });
    const anonymousEntry = (JSON.parse(client.setup('', anonymous)) as { mcpServers: Record<string, unknown> }).mcpServers[SERVER_NAME];
    expect(anonymousEntry).toEqual({ type: 'http', url });
  });

  it('claude-desktop bridges through mcp-remote with the header as an argument', () => {
    const client = clientById('claude-desktop');
    const entry = (JSON.parse(client.setup('', keyed)) as { mcpServers: Record<string, { args: string[] }> }).mcpServers[SERVER_NAME];
    expect(entry).toEqual({
      command: 'npx',
      args: ['-y', 'mcp-remote', url, '--header', 'Authorization: Bearer re0_test_key'],
    });
    expect(client.configPath({ home: '/Users/me', os: 'darwin' })).toBe(
      '/Users/me/Library/Application Support/Claude/claude_desktop_config.json',
    );
    expect(client.configPath({ home: 'C:/Users/me', os: 'win32' })).toBeNull();
    expect(client.configPath({ home: 'C:/Users/me', os: 'win32', appData: 'C:/Users/me/AppData/Roaming' })).toBe(
      'C:/Users/me/AppData/Roaming/Claude/claude_desktop_config.json',
    );
  });
});

describe('codex', () => {
  const codex = clientById('codex');

  it('appends its own table to an existing file and removes only that table', () => {
    const existing = 'model = "o3"\n\n[mcp_servers.other]\ncommand = "x"\n';
    const written = codex.setup(existing, keyed);
    expect(written).toBe(
      'model = "o3"\n\n[mcp_servers.other]\ncommand = "x"\n\n[mcp_servers.re0]\nurl = "https://re0.com/mcp"\nbearer_token_env_var = "RE0_API_KEY"\n',
    );
    expect(codex.hasEntry(written)).toBe(true);
    expect(codex.remove(written)).toBe(existing);
  });

  it('replaces its table in place when it is not the last one', () => {
    const existing = '[mcp_servers.re0]\nurl = "http://old/mcp"\n\n[mcp_servers.other]\ncommand = "x"\n';
    const written = codex.setup(existing, anonymous);
    expect(written).toBe('[mcp_servers.re0]\nurl = "https://re0.com/mcp"\n\n[mcp_servers.other]\ncommand = "x"\n');
    expect(codex.remove(written)).toBe('[mcp_servers.other]\ncommand = "x"\n');
  });

  it('writes nothing about a key when there is none', () => {
    expect(codex.setup('', anonymous)).toBe('[mcp_servers.re0]\nurl = "https://re0.com/mcp"\n');
    expect(codex.note?.(anonymous)).toBeNull();
    expect(codex.note?.(keyed)).toMatch(/RE0_API_KEY/);
  });
});

describe('arguments', () => {
  it('knows every client once', () => {
    expect(CLIENTS.map((client) => client.id)).toEqual([...CLIENT_IDS]);
  });

  it('parses setup with repeatable clients, a key and a url', () => {
    const args = parseArgs(['setup', '--client', 'cursor', '--client', 'codex', '--key', 'k', '--url', 'http://localhost:3000/mcp/', '-y']);
    expect(args).toEqual({
      command: 'setup',
      clients: ['cursor', 'codex'],
      key: 'k',
      url: 'http://localhost:3000/mcp',
      yes: true,
    });
  });

  it('defaults to installed clients, all when asked, and refuses the unknown', () => {
    expect(parseArgs(['remove']).clients).toBe('installed');
    expect(parseArgs(['setup', '--client', 'all']).clients).toBe('all');
    expect(parseArgs([]).command).toBe('help');
    expect(parseArgs(['--version']).command).toBe('version');
    expect(() => parseArgs(['setup', '--client', 'vim'])).toThrow(/unknown client/);
    expect(() => parseArgs(['setup', '--key'])).toThrow(/needs a value/);
    expect(() => parseArgs(['install'])).toThrow(/unknown command/);
  });
});
