#!/usr/bin/env bash
#
# Run the full test suite -- integration included -- against a disposable
# local Postgres. One command, no state left behind:
#
#   ./scripts/test-integration.sh            # full suite
#   ./scripts/test-integration.sh tests/integration/ingestion.test.ts
#
# Needs Docker (for pgvector/pgvector) and node_modules installed. The
# database container and the WebSocket proxy (tests/fixtures/wsproxy.mjs) are
# created fresh and torn down on exit, pass or fail. CI runs the same steps
# through .github/workflows/test.yml; keep the two in lockstep.
set -euo pipefail
cd "$(dirname "$0")/.."

PG_CONTAINER=re0-test-pg
PG_PORT=5439
WS_PORT=5440
DATABASE_URL="postgres://postgres:pw@127.0.0.1:${PG_PORT}/re0"

cleanup() {
  if [[ -n "${WSPROXY_PID:-}" ]]; then
    kill "${WSPROXY_PID}" 2>/dev/null || true
    wait "${WSPROXY_PID}" 2>/dev/null || true
  fi
  docker rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
docker run -d --name "${PG_CONTAINER}" \
  -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=re0 \
  -p "127.0.0.1:${PG_PORT}:5432" \
  pgvector/pgvector:pg16 >/dev/null

echo "waiting for postgres..."
for _ in $(seq 1 30); do
  docker exec "${PG_CONTAINER}" pg_isready -U postgres -q && break
  sleep 1
done

# Migrations, in journal order. `--> statement-breakpoint` is a SQL comment,
# so the files run as-is. drizzle-kit is not used here: its runner needs the
# Neon WebSocket path this script is busy providing.
for migration in db/migrations/00*.sql; do
  docker exec -i "${PG_CONTAINER}" psql -q -v ON_ERROR_STOP=1 -U postgres -d re0 \
    < "${migration}" >/dev/null
done
echo "migrations applied"

WSPROXY_PORT="${WS_PORT}" WSPROXY_TARGET="127.0.0.1:${PG_PORT}" \
  node tests/fixtures/wsproxy.mjs &
WSPROXY_PID=$!
sleep 1

TEST_DATABASE_URL="${DATABASE_URL}" \
TEST_WS_PROXY="127.0.0.1:${WS_PORT}/v2" \
  npx vitest run "$@"
