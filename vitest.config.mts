import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Unit and security tests. architecture.md 18.
 *
 * `tests/integration` needs a live database and is skipped unless
 * TEST_DATABASE_URL is set, so `npm test` stays runnable without Neon.
 *
 * The setup file is a no-op unless TEST_WS_PROXY is set as well; it exists so
 * the integration tests can run against a local Postgres through a
 * WebSocket-to-TCP proxy, using the same driver production uses. See the file
 * itself for the two commands.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/fixtures/local-postgres.ts'],
  },
});
