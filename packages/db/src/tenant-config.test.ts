import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { ConfigSchema } from '@inky/core/config';
import * as schema from './schema.js';
import { loadTenantConfigByOrg, upsertTenantConfig } from './tenant-config.js';

// Hermetic integration tests: an in-process Postgres (pglite, real PG engine in
// WASM) with the committed migration applied. Proves the schema + row adapters +
// migration end-to-end, no external database. A fixed key, injected (no globals).
const ENV = { INKY_DB_ENCRYPTION_KEY: 'c'.repeat(64) } as NodeJS.ProcessEnv;
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

async function freshDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

test('a full Config written to the DB loads back identical (rows ↔ Config)', async () => {
  const db = await freshDb();
  const config = ConfigSchema.parse({
    org: 'your-org',
    repos: ['api', 'web'],
    windowHours: 168,
    excludePeople: ['alice'],
    aliases: { bob: ['bob-work'] },
    github: { appId: '123456', installationId: 78901234 },
    discord: {
      webhookUrl: 'https://discord.com/api/webhooks/1/abc',
      applicationId: '999',
      guildId: '888',
      channelId: '777',
    },
    schedule: { timezone: 'America/Los_Angeles', jobs: [{ cron: '0 9 * * 1-5', label: 'daily' }] },
    roadmap: { enabled: true, source: 'roadmap-md', path: 'docs/ROADMAP.md', repo: 'web' },
  });
  await upsertTenantConfig(db, config, { name: 'Your Org' }, ENV);
  const loaded = await loadTenantConfigByOrg(db, 'your-org', ENV);
  assert.deepEqual(loaded, config);
});

test('the webhook URL is encrypted at rest, never stored plaintext', async () => {
  const db = await freshDb();
  const config = ConfigSchema.parse({
    org: 'o',
    github: { appId: '1', installationId: 2 },
    discord: { webhookUrl: 'https://secret.example/hook' },
  });
  await upsertTenantConfig(db, config, {}, ENV);
  const [row] = await db.select().from(schema.channels);
  assert.ok(row);
  assert.ok(!String(row.discordWebhookUrl).includes('secret.example'));
  // ...but it decrypts back through the loader.
  const loaded = await loadTenantConfigByOrg(db, 'o', ENV);
  assert.equal(loaded?.discord.webhookUrl, 'https://secret.example/hook');
});

test('upsert is idempotent — re-writing updates in place (one tenant, latest settings)', async () => {
  const db = await freshDb();
  const base = { org: 'o', github: { appId: '1', installationId: 2 } };
  await upsertTenantConfig(db, ConfigSchema.parse({ ...base, windowHours: 24 }), {}, ENV);
  await upsertTenantConfig(db, ConfigSchema.parse({ ...base, windowHours: 168 }), {}, ENV);
  const loaded = await loadTenantConfigByOrg(db, 'o', ENV);
  assert.equal(loaded?.windowHours, 168);
  assert.equal((await db.select().from(schema.tenants)).length, 1);
  assert.equal((await db.select().from(schema.installations)).length, 1);
  assert.equal((await db.select().from(schema.configs)).length, 1);
});

test('loadTenantConfigByOrg returns null for an unknown org', async () => {
  const db = await freshDb();
  assert.equal(await loadTenantConfigByOrg(db, 'nobody', ENV), null);
});

test('a PAT tenant (no GitHub App) round-trips, with no installation row', async () => {
  const db = await freshDb();
  const config = ConfigSchema.parse({
    org: 'pat-org',
    windowHours: 24,
    schedule: { timezone: 'America/Los_Angeles', jobs: [{ cron: '0 9 * * *', label: 'daily' }] },
    discord: { applicationId: '123', guildId: '456' }, // non-secret; webhook stays in env
  });
  await upsertTenantConfig(db, config, { name: 'PAT Org' }, ENV);

  const loaded = await loadTenantConfigByOrg(db, 'pat-org', ENV);
  assert.deepEqual(loaded, config); // github resolves back to {} (env PAT at runtime)
  assert.deepEqual(loaded?.github, {});
  assert.equal((await db.select().from(schema.installations)).length, 0); // no App row written
});

test('switching an App tenant to a PAT tenant drops the stale installation row', async () => {
  const db = await freshDb();
  const org = 'flip';
  await upsertTenantConfig(db, ConfigSchema.parse({ org, github: { appId: '1', installationId: 2 } }), {}, ENV);
  assert.equal((await db.select().from(schema.installations)).length, 1);
  // Re-provision the same tenant as PAT (no github App).
  await upsertTenantConfig(db, ConfigSchema.parse({ org }), {}, ENV);
  assert.equal((await db.select().from(schema.installations)).length, 0);
  assert.deepEqual((await loadTenantConfigByOrg(db, org, ENV))?.github, {});
});
