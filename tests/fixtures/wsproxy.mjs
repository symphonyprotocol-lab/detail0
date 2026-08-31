/**
 * A WebSocket-to-TCP proxy for running the integration tests against a plain
 * Postgres. The production driver (`@neondatabase/serverless`) speaks the
 * Postgres wire protocol over a WebSocket; Neon terminates that WebSocket in
 * its own proxy, a local container has nothing listening for it. This is that
 * missing piece, small enough to own: accept a WebSocket, open a TCP socket to
 * the target database, splice bytes both ways.
 *
 * The driver's `wsProxy` hook is set by `local-postgres.ts` from
 * TEST_WS_PROXY; the target comes from WSPROXY_TARGET (host:port, default
 * 127.0.0.1:5439). Used by scripts/test-integration.sh locally and by the CI
 * workflow -- never in production.
 */
import net from 'node:net';
import { WebSocketServer } from 'ws';

const port = Number(process.env.WSPROXY_PORT ?? 5440);
const target = process.env.WSPROXY_TARGET ?? '127.0.0.1:5439';
const at = target.lastIndexOf(':');
const targetHost = target.slice(0, at);
const targetPort = Number(target.slice(at + 1));

const wss = new WebSocketServer({ port });
wss.on('connection', (ws) => {
  const sock = net.connect({ host: targetHost, port: targetPort });
  sock.on('data', (data) => ws.send(data));
  sock.on('close', () => ws.close());
  sock.on('error', () => ws.close());
  ws.on('message', (data) => sock.write(data));
  ws.on('close', () => sock.destroy());
  ws.on('error', () => sock.destroy());
});

console.log(`wsproxy listening on :${port}, forwarding to ${target}`);
