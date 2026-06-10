import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@inky/db/schema';
import { upsertTenantConfig } from '@inky/db';
import { ConfigSchema, type Config } from '@inky/core/config';
import { runWorker } from './index.js';

const ENV = { INKY_DB_ENCRYPTION_KEY: 'c'.repeat(64) } as NodeJS.ProcessEnv;
const MIGRATIONS = fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url));

async function freshDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

const patConfig = (org = 'acme'): Config =>
  ConfigSchema.parse({
    org,
    windowHours: 168,
    schedule: { timezone: 'America/Los_Angeles', jobs: [{ cron: '0 9 * * *', label: 'daily' }] },
    discord: { applicationId: '1', guildId: '2' }, // PAT tenant; webhook stays in env
  });

test('runWorker loads the tenant config and hands runServe a DB watch', async () => {
  const db = await freshDb();
  await upsertTenantConfig(db, patConfig('acme'), {}, ENV);

  let captured: { config: Config; watchType: string } | undefined;
  let closed = 0;
  await runWorker({
    env: { ...ENV, INKY_ORG: 'acme', DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/x' },
    log: () => {},
    openDb: () => ({ db, close: async () => void closed++ }),
    runServe: async (config, _secrets, opts) => {
      captured = { config, watchType: typeof opts?.watch };
    },
  });

  assert.equal(captured?.config.org, 'acme');
  assert.equal(captured?.config.windowHours, 168);
  assert.equal(captured?.watchType, 'function'); // dbConfigSource.watch threaded through
  assert.equal(closed, 1); // db handle closed in the finally
});

test('runWorker throws a clear error when INKY_ORG is unset', async () => {
  await assert.rejects(
    () => runWorker({ env: { ...ENV }, log: () => {}, runServe: async () => {} }),
    /INKY_ORG is not set/,
  );
});

test('runWorker throws (and closes the db) when the tenant has not been seeded', async () => {
  const db = await freshDb();
  let closed = 0;
  await assert.rejects(
    () =>
      runWorker({
        env: { ...ENV, INKY_ORG: 'ghost' },
        log: () => {},
        openDb: () => ({ db, close: async () => void closed++ }),
        runServe: async () => {},
      }),
    /no tenant config for org "ghost"/,
  );
  assert.equal(closed, 1);
});
