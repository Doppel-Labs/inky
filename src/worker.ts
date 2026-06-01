/**
 * The long-running worker — Herald's "runs on its own" trigger layer.
 *
 * A single in-process scheduler (croner) fires the standup on config.schedule.
 * Each tick is wrapped so a failed run (GitHub hiccup, LLM error, Discord 5xx)
 * is logged and the worker keeps going — a daemon must never die on one bad day.
 * croner's `protect` guards against overlap if a run outlasts the interval.
 *
 * This is a thin adapter over buildStandup() + the Discord delivery, kept
 * host-agnostic: deploy it to any always-on host (Railway/Fly/Render/a box).
 * The scheduler and the cycle body are injectable so the wiring is unit-tested
 * without real timers or network.
 */
import { Cron } from 'croner';
import type { Config, Secrets } from './config.js';
import { resolveWebhookUrl } from './config.js';
import { buildStandup } from './standup.js';
import { postStandupToDiscord } from './discord.js';

/** The slice of a scheduled job the worker needs — satisfied by croner's Cron. */
export interface ScheduledJob {
  nextRun(): Date | null;
  stop(): void;
}

/**
 * Creates a scheduled job. Defaults to croner; tests inject a fake that fires
 * the tick synchronously. `protect` asks the scheduler to skip a tick while a
 * previous run is still in flight.
 */
export type SchedulerFactory = (
  pattern: string,
  options: { timezone: string; protect: boolean },
  onTick: () => void | Promise<void>,
) => ScheduledJob;

const cronScheduler: SchedulerFactory = (pattern, options, onTick) =>
  new Cron(pattern, { timezone: options.timezone, protect: true }, onTick);

export interface WorkerOptions {
  /** Progress sink (defaults to stderr). */
  log?: (msg: string) => void;
  /** Run one cycle immediately and resolve, without scheduling. */
  once?: boolean;
  /** Build the standup but print it instead of posting (no webhook required). */
  dryRun?: boolean;
  /** Injectable scheduler (defaults to croner). */
  scheduler?: SchedulerFactory;
  /** Injectable cycle body (defaults to the real build + deliver). */
  runCycle?: () => Promise<void>;
}

export interface WorkerHandle {
  /** Stop scheduling further runs. */
  stop: () => void;
  /** The job's next scheduled run (null in --once mode). */
  nextRun: () => Date | null;
}

/**
 * Start the worker. In --once mode it runs a single cycle and resolves; otherwise
 * it schedules and returns a handle (the caller keeps the process alive and wires
 * signals). The returned promise resolving does NOT mean the worker stopped.
 */
export async function startWorker(
  config: Config,
  secrets: Secrets,
  opts: WorkerOptions = {},
): Promise<WorkerHandle> {
  const log = opts.log ?? ((m: string) => process.stderr.write(m + '\n'));
  const webhookUrl = resolveWebhookUrl(config, secrets);

  // A scheduled worker that posts needs somewhere to post. Fail fast and loud
  // rather than silently running daily into the void. (--dry-run is exempt.)
  if (!opts.dryRun && !webhookUrl && !opts.runCycle) {
    throw new Error(
      'herald serve: no Discord webhook configured. Set DISCORD_WEBHOOK_URL (or discord.webhookUrl in config), or pass --dry-run to print instead.',
    );
  }

  const runCycle =
    opts.runCycle ??
    (async () => {
      log('herald: running scheduled standup…');
      const built = await buildStandup(config, secrets, { log });
      if (opts.dryRun || !webhookUrl) {
        log('herald: dry run — printing standup instead of posting.');
        process.stdout.write(built.markdown + '\n');
        return;
      }
      const { messages, embeds } = await postStandupToDiscord(webhookUrl, built.markdown);
      log(`herald: posted ${embeds} embed(s) in ${messages} message(s) to Discord.`);
    });

  // One scheduled tick: never throws — a bad run is logged, the worker lives on.
  let job: ScheduledJob | null = null;
  const tick = async () => {
    try {
      await runCycle();
    } catch (err) {
      log(`herald: scheduled run failed: ${(err as Error).message}`);
    } finally {
      const next = job?.nextRun() ?? null;
      if (next) log(`herald: next run ${next.toISOString()}.`);
    }
  };

  if (opts.once) {
    await tick();
    return { stop: () => {}, nextRun: () => null };
  }

  const scheduler = opts.scheduler ?? cronScheduler;
  job = scheduler(config.schedule.cron, { timezone: config.schedule.timezone, protect: true }, tick);
  const next = job.nextRun();
  log(
    `herald: worker started — schedule "${config.schedule.cron}" (${config.schedule.timezone}). ` +
      `Next run: ${next ? next.toISOString() : 'n/a'}.`,
  );

  return { stop: () => job?.stop(), nextRun: () => job?.nextRun() ?? null };
}
