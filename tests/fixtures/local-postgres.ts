/**
 * Points the Neon serverless driver at a plain local Postgres.
 *
 * The integration tests exercise the same driver production uses
 * (`drizzle-orm/neon-serverless`), and that driver speaks the Postgres wire
 * protocol over a WebSocket rather than over TCP. Against Neon there is a
 * proxy on the other end; against a local container there is not, so this file
 * tells the driver where a local one is listening.
 *
 * Loaded only when `TEST_WS_PROXY` is set, and it changes nothing about the
 * queries -- same driver, same SQL, same transactions. Running the suite
 * against Neon needs neither this file nor the variable:
 *
 *   TEST_DATABASE_URL='postgres://...' npx vitest run tests/integration
 *
 * Running it against a local container needs both, plus any WebSocket-to-TCP
 * proxy in front of Postgres:
 *
 *   TEST_DATABASE_URL='postgres://postgres:pw@127.0.0.1:5432/re0' \
 *   TEST_WS_PROXY='127.0.0.1:5433/v2' \
 *   npx vitest run tests/integration --setupFiles ./tests/fixtures/local-postgres.ts
 */
import { neonConfig } from '@neondatabase/serverless';

const proxy = process.env.TEST_WS_PROXY;

if (proxy) {
  neonConfig.wsProxy = () => proxy;
  /* A local proxy has no certificate, and none of this leaves the machine. */
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}
