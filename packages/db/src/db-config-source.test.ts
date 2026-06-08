import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { ConfigSchema, type Config } from '@inky/core/config';
import type { IntervalFn } from '@inky/core/config-source';
import * as schema from './schema.js';
import { upsertTenantConfig } from './tenant-config.js';
import { dbConfigSource } from './db-config-source.js';

const ENV = { INKY_DB_ENCRYPTION_KEY: 'c'.repeat(64) } as NodeJS.ProcessEnv;
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

async function freshDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

/** A manual interval: captures the (async) tick so a test fires + awaits polls. */
function manualInterval() {
  let tick: () => unknown = () => {};
  let stopped = 0;
  const interval: IntervalFn = (cb) => {
    tick = cb;
    return { stop: () => void stopped++ };
  };
  return { interval, poll: async () => void (await tick()), stopped: () => stopped };
}

const cfg = (over: Record<string, unknown> = {}): Config =>
  ConfigSchema.parse({
    org: 'acme',
    github: { appId: '1', installationId: 2 },
    schedule: { timezone: 'America/Los_Angeles', jobs: [{ cron: '0 9 * * 1-5', label: 'daily' }] },
    ...over,
  });

test('dbConfigSource.load returns the tenant Config', async () => {
  const db = await freshDb();
  await upsertTenantConfig(db, cfg({ windowHours: 48 }), {}, ENV);
  const src = dbConfigSource(db, 'acme', { env: ENV });
  const loaded = await src.load();
  assert.equal(loaded.windowHours, 48);
});

test('dbConfigSource.load throws for an unknown org', async () => {
  const db = await freshDb();
  const src = dbConfigSource(db, 'nope', { env: ENV });
  await assert.rejects(() => src.load(), /no tenant config for org "nope"/);
});

test('dbConfigSource.watch fires onChange when a tenant row changes', async () => {
  const db = await freshDb();
  await upsertTenantConfig(db, cfg(), {}, ENV);
  const { interval, poll } = manualInterval();
  const src = dbConfigSource(db, 'acme', { env: ENV, interval });

  const changes: Config[] = [];
  src.watch((c) => changes.push(c), () => {});

  await poll(); // seeds the baseline — no change yet
  assert.equal(changes.length, 0);

  // Change the schedule via the same write path the dashboard would use.
  await upsertTenantConfig(
    db,
    cfg({ schedule: { timezone: 'America/Los_Angeles', jobs: [{ cron: '0 9 * * *', label: 'daily' }] } }),
    {},
    ENV,
  );
  await poll(); // detects the change
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.schedule.jobs[0]!.cron, '0 9 * * *');

  await poll(); // no further change → no extra fire
  assert.equal(changes.length, 1);
});

test('dbConfigSource.watch routes a load error to onError without throwing', async () => {
  const db = await freshDb(); // no tenant provisioned → loadOrThrow rejects
  const { interval, poll } = manualInterval();
  const src = dbConfigSource(db, 'ghost', { env: ENV, interval });
  const errs: Error[] = [];
  src.watch(() => {}, (e) => errs.push(e));
  await assert.doesNotReject(() => poll());
  assert.equal(errs.length, 1);
  assert.match(errs[0]!.message, /no tenant config for org "ghost"/);
});
