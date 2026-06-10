/**
 * Inky's hosted worker — the no-redeploy config path.
 *
 * Reads its `Config` from Postgres (the tenant rows the dashboard / seed write),
 * hands core's `runServe` a `dbConfigSource` watch, and so picks up schedule and
 * setting changes live on the poll, without a restart. This wiring lives in an
 * app because it depends on BOTH @inky/core and @inky/db — core can't import db
 * (db depends on core), so the DB config source is constructed here.
 *
 * Self-hosters don't need this: `inky serve --config inky.config.json` (file
 * source, zero Postgres) is the simple path. This is the hosted/console variant.
 *
 * Env: DATABASE_URL (Postgres), INKY_ORG (which tenant to serve), plus the usual
 * secrets (GITHUB_TOKEN or App key, DISCORD_WEBHOOK_URL, DISCORD_BOT_TOKEN) and
 * INKY_DB_ENCRYPTION_KEY (to decrypt a stored webhook, if any).
 */
import 'dotenv/config';
import { createDb, dbConfigSource, loadTenantConfigByOrg } from '@inky/db';
import { loadSecrets } from '@inky/core/config';
import { runServe } from '@inky/core/serve';
import { createTelemetry } from '@inky/core/telemetry';

type Db = Parameters<typeof loadTenantConfigByOrg>[0];

export interface RunWorkerDeps {
  env?: NodeJS.ProcessEnv;
  log?: (msg: string) => void;
  /** Open a DB handle. Defaults to a pooled connection from DATABASE_URL. Tests inject pglite. */
  openDb?: (env: NodeJS.ProcessEnv) => { db: Db; close: () => Promise<void> };
  /** Defaults to core's runServe. Injected in tests so the call returns instead of blocking. */
  runServe?: typeof runServe;
}

/**
 * Boot the DB-backed worker for `INKY_ORG`. Loads that tenant's config, wires a
 * DB config source for live reload, and runs the worker (+ bot) via core's
 * `runServe`. Throws a clear error if `INKY_ORG` is unset or the tenant hasn't
 * been seeded. Factored out (with injectable deps) so it's unit-testable.
 */
export async function runWorker(deps: RunWorkerDeps = {}): Promise<void> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((m: string) => process.stderr.write(m + '\n'));
  const run = deps.runServe ?? runServe;

  const org = env.INKY_ORG;
  if (!org) {
    throw new Error('INKY_ORG is not set — the DB-backed worker needs the org whose tenant config to load.');
  }

  const openDb =
    deps.openDb ??
    ((e: NodeJS.ProcessEnv) => {
      const { db, pool } = createDb(e.DATABASE_URL);
      return { db, close: () => pool.end() };
    });
  const { db, close } = openDb(env);

  try {
    const config = await loadTenantConfigByOrg(db, org, env);
    if (!config) {
      throw new Error(
        `no tenant config for org "${org}" in the database. Seed it first: inky-worker-seed --config <file>.`,
      );
    }
    const secrets = loadSecrets(env);
    const source = dbConfigSource(db, org, { env });
    const telemetry = createTelemetry(config, { log });
    log(
      `inky-worker: serving "${org}" from the database (hot-reload via poll). ` +
        `Bot ${secrets.discordBotToken ? 'on' : 'off'}.`,
    );
    // Long-running: returns only on shutdown (or immediately, in tests).
    await run(config, secrets, { watch: source.watch, log, telemetry });
  } finally {
    await close();
  }
}

// Run when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker().catch((err: unknown) => {
    process.stderr.write(`inky-worker: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
