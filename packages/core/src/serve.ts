/**
 * The `serve` orchestration, extracted so it can run from two entry points with
 * different config sources:
 *   - the `inky serve` CLI (file source — the zero-dependency self-host path), and
 *   - the hosted DB-backed worker in `apps/worker` (DB source — no-redeploy config).
 *
 * It wires the scheduled-post worker (+ its hot-reload `watch`) and the optional
 * `/standup`,`/ask` gateway bot, then blocks until a shutdown signal. The config
 * *source* is the caller's concern: `runServe` only takes the resulting `watch`
 * subscription, so this module never imports `@inky/db` (which would be a cycle —
 * db depends on core, not the reverse).
 *
 * `startWorker`/`startBot` and the block-until-signal step are injectable so the
 * branching (once / webhook / bot / nothing-to-run) is unit-tested without real
 * timers, a gateway connection, or a hanging process.
 */
import type { Config, Secrets } from './config.js';
import { resolveWebhookUrl } from './config.js';
import type { ConfigWatch } from './config-source.js';
import { configFeatureFlags, noopTracker, type Tracker } from './telemetry.js';
import type { WorkerHandle, WorkerOptions } from './worker.js';

/** A stoppable long-running handle (worker or bot). */
interface Stoppable {
  stop: () => void | Promise<void>;
}

export interface RunServeOptions {
  /** Build + print each standup but don't post (no webhook required). */
  dryRun?: boolean;
  /** Run every configured job once and return, without the long-running loop. */
  once?: boolean;
  /** Live config-reload subscription from a ConfigSource (file or DB). */
  watch?: ConfigWatch;
  log?: (msg: string) => void;
  telemetry?: Tracker;
  /** Injectable worker factory (defaults to the real `./worker.js`). */
  startWorker?: (config: Config, secrets: Secrets, opts: WorkerOptions) => Promise<WorkerHandle>;
  /** Injectable bot factory (defaults to the real `./bot.js`). */
  startBot?: (
    config: Config,
    secrets: Secrets,
    opts: { log: (msg: string) => void; telemetry: Tracker },
  ) => Promise<Stoppable>;
  /**
   * Block until shutdown, given a stop-all callback. Defaults to wiring
   * SIGINT/SIGTERM (stop, then exit) and never resolving. Injected in tests so the
   * call returns instead of hanging.
   */
  waitForShutdown?: (stopAll: () => Promise<void>) => Promise<void>;
}

const defaultWaitForShutdown =
  (log: (msg: string) => void) =>
  (stopAll: () => Promise<void>): Promise<void> =>
    new Promise<void>(() => {
      const shutdown = async (sig: string) => {
        log(`inky: received ${sig}, stopping…`);
        await stopAll();
        process.exit(0);
      };
      process.on('SIGINT', () => void shutdown('SIGINT'));
      process.on('SIGTERM', () => void shutdown('SIGTERM'));
    });

/**
 * Run the worker (+ bot) for one config, reloading live from `opts.watch`. In
 * `--once` mode it runs each job once and returns; otherwise it starts the
 * long-running services and blocks until shutdown. Throws if there's nothing to
 * run (no webhook/dry-run and no bot token).
 */
export async function runServe(config: Config, secrets: Secrets, opts: RunServeOptions = {}): Promise<void> {
  const log = opts.log ?? ((m: string) => process.stderr.write(m + '\n'));
  const telemetry = opts.telemetry ?? noopTracker;
  const startWorker =
    opts.startWorker ?? (async (c, s, o) => (await import('./worker.js')).startWorker(c, s, o));
  const startBot = opts.startBot ?? (async (c, s, o) => (await import('./bot.js')).startBot(c, s, o));

  if (opts.once) {
    // A single scheduled-post cycle (for testing); no bot loop, no reload.
    await startWorker(config, secrets, { once: true, dryRun: opts.dryRun, log, telemetry });
    return;
  }

  // A long-running deployment is the thing telemetry most wants to count.
  void telemetry.track('instance_started', configFeatureFlags(config));

  const stops: Array<() => void | Promise<void>> = [];

  // Scheduled posting — runs when a webhook is configured (or in --dry-run).
  const webhookUrl = resolveWebhookUrl(config, secrets);
  if (webhookUrl || opts.dryRun) {
    const worker = await startWorker(config, secrets, {
      dryRun: opts.dryRun,
      log,
      telemetry,
      watch: opts.watch,
    });
    stops.push(worker.stop);
  }

  // On-demand /standup & /ask — runs when a bot token is configured.
  if (secrets.discordBotToken) {
    const bot = await startBot(config, secrets, { log, telemetry });
    stops.push(bot.stop);
  }

  if (stops.length === 0) {
    throw new Error(
      'inky serve: nothing to run. Set DISCORD_WEBHOOK_URL for scheduled posts and/or DISCORD_BOT_TOKEN for the /standup command.',
    );
  }

  const stopAll = async () => {
    await Promise.allSettled(stops.map((stop) => stop()));
  };
  const wait = opts.waitForShutdown ?? defaultWaitForShutdown(log);
  await wait(stopAll); // long-running: blocks until a signal
}
