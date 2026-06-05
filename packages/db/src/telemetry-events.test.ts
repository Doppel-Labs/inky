import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { TelemetryEventSchema } from '@inky/core/telemetry';
import * as schema from './schema.js';
import { insertTelemetryEvent } from './telemetry-events.js';

// Hermetic: an in-process Postgres (pglite) with the committed migrations
// applied — proves the telemetry_events table + insert helper end-to-end.
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

async function freshDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

test('insertTelemetryEvent writes a validated event and stamps received_at', async () => {
  const db = await freshDb();
  const event = TelemetryEventSchema.parse({
    event: 'standup_run',
    instanceId: 'install-abc',
    version: '1.2.3',
    ts: 1_700_000_000,
    props: { trigger: 'scheduled', windowHours: 24, dryRun: false },
  });

  const id = await insertTelemetryEvent(db, event);
  assert.ok(id);

  const [row] = await db.select().from(schema.telemetryEvents);
  assert.ok(row);
  assert.equal(row.instanceId, 'install-abc');
  assert.equal(row.event, 'standup_run');
  assert.equal(row.version, '1.2.3');
  assert.deepEqual(row.props, { trigger: 'scheduled', windowHours: 24, dryRun: false });
  // ts (unix seconds) round-trips to the right instant
  assert.equal(row.ts.getTime(), 1_700_000_000 * 1000);
  // server stamps receivedAt by default
  assert.ok(row.receivedAt instanceof Date);
});

test('insertTelemetryEvent stores an event with no props (props column null)', async () => {
  const db = await freshDb();
  const event = TelemetryEventSchema.parse({
    event: 'heartbeat',
    instanceId: 'install-xyz',
    ts: 1_700_000_500,
  });
  await insertTelemetryEvent(db, event);

  const [row] = await db.select().from(schema.telemetryEvents);
  assert.ok(row);
  assert.equal(row.event, 'heartbeat');
  assert.equal(row.props, null);
  assert.equal(row.version, null);
});

test('the table is anonymous — no tenant column to tie an event to an org', async () => {
  const db = await freshDb();
  // A column named like a tenant reference must not exist on this table.
  const columns = Object.keys(schema.telemetryEvents);
  assert.ok(!columns.includes('tenantId'), 'telemetry_events must not be tenant-scoped');
});
