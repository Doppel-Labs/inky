/**
 * The telemetry ingest — the framework-agnostic core of the endpoint.
 *
 * `handleTelemetry` is deliberately transport-free: hand it a raw request body
 * and a db handle, get back a `{ status, body }` to write to whatever response
 * object your host gives you (a Node http server, a Vercel/Netlify function, a
 * Cloudflare worker). That keeps the validation + persistence logic unit-tested
 * against pglite with no network (see handler.test.ts), and lets the same logic
 * deploy anywhere.
 *
 * It enforces the same contract the client promises: the body must parse to
 * @inky/core's TelemetryEventSchema (an anonymous event name + install id +
 * version + ts + scalar props) and nothing else. Anything malformed is a 400;
 * the row is never tenant-linked.
 */
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { TelemetryEventSchema } from '@inky/core/telemetry';
import { insertTelemetryEvent } from '@inky/db';

// Driver-agnostic db handle — node-postgres in prod, pglite in tests.
type AnyDb = PgDatabase<any, any, any>;

export interface IngestResult {
  status: number;
  body: { ok: boolean; error?: string };
}

/** 400 with a terse, non-leaky reason. */
function badRequest(error: string): IngestResult {
  return { status: 400, body: { ok: false, error } };
}

/**
 * Validate one telemetry event and persist it. `rawBody` may be a JSON string
 * (as a Node http server hands it over) or an already-parsed object (as most
 * serverless runtimes do). Returns 204 on success, 400 on a malformed/invalid
 * event, 500 if the write fails. Never throws.
 */
export async function handleTelemetry(
  rawBody: unknown,
  db: AnyDb,
  log?: (msg: string) => void,
): Promise<IngestResult> {
  let json: unknown = rawBody;
  if (typeof rawBody === 'string') {
    const trimmed = rawBody.trim();
    if (!trimmed) return badRequest('empty body');
    try {
      json = JSON.parse(trimmed);
    } catch {
      return badRequest('invalid JSON');
    }
  }

  const parsed = TelemetryEventSchema.safeParse(json);
  if (!parsed.success) return badRequest('invalid event');

  try {
    await insertTelemetryEvent(db, parsed.data);
    // 204: accepted, no body to send back to a fire-and-forget client.
    return { status: 204, body: { ok: true } };
  } catch (err) {
    // Don't leak internals to the client; log server-side for the operator.
    log?.(`ingest: write failed: ${(err as Error).message}`);
    return { status: 500, body: { ok: false, error: 'ingest failed' } };
  }
}
