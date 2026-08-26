import { defineConfig } from 'drizzle-kit';
import { loadEnvConfig } from '@next/env';

/**
 * drizzle-kit runs outside Next, so nothing has read `.env.local` yet. Using
 * Next's own loader keeps the CLI and the app on identical env resolution --
 * the alternative, a second dotenv setup, drifts the moment the two disagree
 * about precedence.
 */
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Migrations run through the unpooled endpoint, see architecture.md 19.1
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
