import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@inky/db';
import { handleTelemetry } from './handler.js';

// Hermetic: pglite with the committed @inky/db migrations applied. Proves the
// ingest validates + persists end-to-end with no network.
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

async function freshDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

const validEvent = {
  event: 'standup_run',
  instanceId: 'install-abc',
  version: '1.0.0',
  ts: 1_700_000_000,
  props: { trigger: 'scheduled', windowHours: 24 },
};

test('accepts a valid event (JSON string body) and writes one row → 204', async () => {
  const db = await freshDb();
  const r = await handleTelemetry(JSON.stringify(validEvent), db);
  assert.equal(r.status, 204);
  const rows = await db.select().from(schema.telemetryEvents);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.instanceId, 'install-abc');
});

test('accepts an already-parsed object body too', async () => {
  const db = await freshDb();
  const r = await handleTelemetry(validEvent, db);
  assert.equal(r.status, 204);
});

test('rejects malformed JSON → 400, writes nothing', async () => {
  const db = await freshDb();
  const r = await handleTelemetry('{not json', db);
  assert.equal(r.status, 400);
  const rows = await db.select().from(schema.telemetryEvents);
  assert.equal(rows.length, 0);
});

test('rejects an empty body → 400', async () => {
  const db = await freshDb();
  assert.equal((await handleTelemetry('   ', db)).status, 400);
});

test('rejects an unknown event name → 400 (the contract is enforced server-side)', async () => {
  const db = await freshDb();
  const r = await handleTelemetry({ ...validEvent, event: 'exfiltrate' }, db);
  assert.equal(r.status, 400);
});

test('rejects non-scalar props (no nested identity payloads slip through) → 400', async () => {
  const db = await freshDb();
  const r = await handleTelemetry(
    { event: 'standup_run', instanceId: 'i', ts: 1, props: { logins: ['alice'] } },
    db,
  );
  assert.equal(r.status, 400);
});

test('a write failure becomes a 500, never throws', async () => {
  // A db stub whose insert chain throws — proves the catch path.
  const brokenDb = {
    insert: () => ({
      values: () => ({
        returning: () => {
          throw new Error('connection reset');
        },
      }),
    }),
  } as unknown as Parameters<typeof handleTelemetry>[1];
  const r = await handleTelemetry(validEvent, brokenDb);
  assert.equal(r.status, 500);
  assert.equal(r.body.ok, false);
});
