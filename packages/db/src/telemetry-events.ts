/**
 * Persist an anonymous telemetry event. The ingest validates the incoming body
 * against @inky/core's TelemetryEventSchema (the shared wire contract), then
 * hands the parsed event here to write one row. Kept tiny and pure (db + event
 * in, insert out) so it's trivially testable against pglite.
 */
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { TelemetryEvent } from '@inky/core/telemetry';
import { telemetryEvents } from './schema.js';

// Driver-agnostic db handle — the same code runs on node-postgres (prod) and
// pglite (tests). Mirrors tenant-config.ts.
type AnyDb = PgDatabase<any, any, any>;

/**
 * Insert one validated event. The client-sent `ts` (unix seconds) is converted
 * to a Date for the timestamptz column; `received_at` is stamped server-side by
 * the column default. Returns the new row id.
 */
export async function insertTelemetryEvent(db: AnyDb, event: TelemetryEvent): Promise<string> {
  const [row] = await db
    .insert(telemetryEvents)
    .values({
      instanceId: event.instanceId,
      event: event.event,
      version: event.version,
      props: event.props,
      ts: new Date(event.ts * 1000),
    })
    .returning({ id: telemetryEvents.id });
  return row!.id;
}
