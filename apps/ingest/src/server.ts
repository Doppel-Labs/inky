#!/usr/bin/env node
/**
 * A standalone Node http server around `handleTelemetry` — the simplest way to
 * "stand up the ingest": one always-on web service (deploy to Render/Fly/a box)
 * with a Postgres URL. For a serverless deploy instead, skip this file and wrap
 * `handleTelemetry` from ./handler in your platform's function signature.
 *
 *   POST /t   → record an event   (204 on success, 400 invalid, 500 write error)
 *   GET  /    → health check      (200 "ok")
 *
 * Boring on purpose: no framework, a small JSON body cap, and one shared pg pool
 * for the process. The body cap stops a bad client from buffering unbounded data.
 */
import { createServer } from 'node:http';
import { createDb } from '@inky/db';
import { handleTelemetry } from './handler.js';

const PORT = Number(process.env.PORT ?? 8787);
const PATH = process.env.INGEST_PATH ?? '/t';
const MAX_BODY_BYTES = 16 * 1024; // an event envelope is tiny; cap hard.

const { db, pool } = createDb();

const log = (msg: string) => process.stderr.write(msg + '\n');

const server = createServer((req, res) => {
  const send = (status: number, body?: unknown) => {
    if (body === undefined || status === 204) {
      res.writeHead(status).end();
    } else {
      const json = JSON.stringify(body);
      res.writeHead(status, { 'content-type': 'application/json' }).end(json);
    }
  };

  if (req.method === 'GET' && req.url === '/') return send(200, { ok: true });
  if (req.method !== 'POST' || (req.url ?? '').split('?')[0] !== PATH) return send(404, { ok: false });

  let size = 0;
  const chunks: Buffer[] = [];
  let aborted = false;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      aborted = true;
      send(413, { ok: false, error: 'body too large' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (aborted) return;
    void handleTelemetry(Buffer.concat(chunks).toString('utf8'), db, log).then((r) =>
      send(r.status, r.status === 204 ? undefined : r.body),
    );
  });
});

server.listen(PORT, () => log(`inky-ingest: listening on :${PORT} (POST ${PATH})`));

const shutdown = async (sig: string) => {
  log(`inky-ingest: received ${sig}, closing…`);
  server.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
