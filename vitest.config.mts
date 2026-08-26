import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Unit and security tests. architecture.md 18.
 *
 * `tests/integration` needs a live database and is skipped unless
 * TEST_DATABASE_URL is set, so `npm test` stays runnable without Neon.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
