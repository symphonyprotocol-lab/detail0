import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from '@/db/schema';

/**
 * The only place a database driver is constructed.
 * Neon is the authority for business state, publication pointers, the
 * keyword index and vectors. architecture.md 1.1.
 */
let pool: Pool | undefined;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

export function db() {
  pool ??= new Pool({ connectionString: connectionString() });
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof db>;
export { schema };
