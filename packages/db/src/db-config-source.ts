/**
 * A {@link ConfigSource} backed by the tenant-config rows — the opt-in source for
 * the hosted/console tier. The worker loads a tenant's `Config` from Postgres and
 * polls for changes (the dashboard writes via `upsertTenantConfig`), so a
 * schedule/setting edit takes effect WITHOUT a redeploy — the no-redeploy path the
 * file source can't give on a read-only mount.
 *
 * It lives in @inky/db (which depends on @inky/core, not the reverse) so the core
 * worker never imports Postgres; it satisfies core's `ConfigSource` interface,
 * which is all the worker ever sees. An app that depends on BOTH packages (e.g.
 * apps/ingest, or the future console worker) wires this into `startWorker`.
 *
 * NOTE: `loadTenantConfigByOrg`/`upsertTenantConfig` currently assume GitHub App
 * auth. Backing the existing PAT deployment with this source needs that
 * assumption relaxed first (see docs/planning/admin-configurable-schedule-and-console.md).
 */
import type { Config } from '@inky/core/config';
import type { ConfigSource, IntervalFn } from '@inky/core/config-source';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { loadTenantConfigByOrg } from './tenant-config.js';

/** Any drizzle Postgres database over our schema (node-postgres or pglite). */
type AnyDb = PgDatabase<any, any, any>;

const defaultInterval: IntervalFn = (onTick, ms) => {
  const id = setInterval(onTick, ms);
  // Don't let the poller alone keep the process alive — cron/the gateway do that.
  (id as unknown as { unref?: () => void }).unref?.();
  return { stop: () => clearInterval(id) };
};

export interface DbConfigSourceOptions {
  /** Poll interval (ms) for change detection. Default 30000. */
  pollMs?: number;
  /** Injectable interval timer (defaults to setInterval). */
  interval?: IntervalFn;
  /** Env for decrypting the webhook column (defaults to process.env in the loader). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Build a `ConfigSource` for one org's tenant rows. `load()` throws if the tenant
 * doesn't exist (a worker pointed at a missing tenant is a misconfig, not a silent
 * empty). `watch()` polls and compares the freshly-assembled config to the last
 * one seen — so ANY change (schedule, settings, channel) fires `onChange`, while a
 * transient DB/parse error goes to `onError` and polling continues, so a blip
 * never takes the worker down. The first poll seeds the baseline (it never fires
 * `onChange` for the value already in hand at boot).
 */
export function dbConfigSource(db: AnyDb, org: string, opts: DbConfigSourceOptions = {}): ConfigSource {
  const interval = opts.interval ?? defaultInterval;
  const pollMs = opts.pollMs ?? 30_000;

  const loadOrThrow = async (): Promise<Config> => {
    const cfg = await loadTenantConfigByOrg(db, org, opts.env);
    if (!cfg) throw new Error(`no tenant config for org "${org}".`);
    return cfg;
  };

  return {
    load: loadOrThrow,
    watch: (onChange, onError) => {
      let last: string | undefined;
      const check = async () => {
        try {
          const cfg = await loadOrThrow();
          const snap = JSON.stringify(cfg);
          if (last === undefined) {
            last = snap; // seed the baseline on the first poll; don't fire
            return;
          }
          if (snap !== last) {
            last = snap;
            onChange(cfg);
          }
        } catch (err) {
          onError(err as Error);
        }
      };
      const timer = interval(check, pollMs);
      return () => timer.stop();
    },
  };
}
