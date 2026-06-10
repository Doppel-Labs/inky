/**
 * Seed (or re-seed) the database from a Config file, so the DB-backed worker
 * (index.ts) can serve it. Also the interim "admin write path" until the console
 * exists: re-run with an edited config to change live settings — the running
 * worker picks the change up on its next poll, no redeploy.
 *
 *   inky-worker-seed --config inky.config.json
 *
 * Env: DATABASE_URL, and INKY_DB_ENCRYPTION_KEY if the config carries a webhook
 * URL (it's encrypted at rest). Secrets in the env (GITHUB_TOKEN, the webhook
 * when supplied via DISCORD_WEBHOOK_URL) are NOT written to the DB — the worker
 * reads those from the env at runtime, exactly like a file-based config.
 */
import 'dotenv/config';
import { createDb, upsertTenantConfig } from '@inky/db';
import { loadConfig } from '@inky/core/config';

/** Parse `--config <path>` from argv (defaults to inky.config.json). */
export function configPathFromArgs(argv: string[]): string {
  const i = argv.indexOf('--config');
  const path = i >= 0 ? argv[i + 1] : 'inky.config.json';
  if (!path) throw new Error('usage: inky-worker-seed --config <path>');
  return path;
}

export async function seed(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  log: (msg: string) => void = (m) => process.stderr.write(m + '\n'),
): Promise<void> {
  const config = loadConfig(configPathFromArgs(argv));
  const { db, pool } = createDb(env.DATABASE_URL);
  try {
    const id = await upsertTenantConfig(db, config, { name: config.org }, env);
    log(`inky-worker-seed: upserted tenant "${config.org}" (${id}). The worker picks it up on its next poll.`);
  } finally {
    await pool.end();
  }
}

// Run when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((err: unknown) => {
    process.stderr.write(`inky-worker-seed: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
