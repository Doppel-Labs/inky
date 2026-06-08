import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, type ScheduledJob, type SchedulerFactory } from './worker.js';
import { ConfigSchema, type Config, type Secrets } from './config.js';

function cfg(over: Record<string, unknown> = {}): Config {
  return ConfigSchema.parse({ org: 'Acme', ...over });
}

const secrets: Secrets = { githubToken: 't' };
const secretsWithHook: Secrets = {
  githubToken: 't',
  discordWebhookUrl: 'https://discord.com/api/webhooks/1/abc',
};

/** A scheduler that records each (pattern, timezone, onTick) and returns a controllable job. */
function captureScheduler(makeJob: () => ScheduledJob = () => ({ nextRun: () => null, stop: () => {} })) {
  const captured: { pattern: string; timezone: string; onTick: () => void | Promise<void> }[] = [];
  const factory: SchedulerFactory = (pattern, options, onTick) => {
    captured.push({ pattern, timezone: options.timezone, onTick });
    return makeJob();
  };
  return { factory, captured };
}

const dailyWeekly = {
  timezone: 'America/New_York',
  jobs: [
    { cron: '0 9 * * 1-5', windowHours: 24, label: 'daily' },
    { cron: '0 9 * * 1', windowHours: 168, label: 'weekly' },
  ],
};

test('startWorker --once runs each configured job once', async () => {
  const ran: (string | undefined)[] = [];
  const handle = await startWorker(cfg({ schedule: dailyWeekly }), secrets, {
    once: true,
    runJob: async (job) => void ran.push(job.label),
    log: () => {},
  });
  assert.deepEqual(ran, ['daily', 'weekly']);
  assert.equal(handle.nextRun(), null);
});

test('startWorker schedules one cron job per configured job, with the shared timezone', async () => {
  const next = new Date('2026-06-04T13:00:00.000Z');
  const { factory, captured } = captureScheduler(() => ({ nextRun: () => next, stop: () => {} }));
  const ran: (string | undefined)[] = [];
  const handle = await startWorker(cfg({ schedule: dailyWeekly }), secretsWithHook, {
    scheduler: factory,
    runJob: async (job) => void ran.push(job.label),
    log: () => {},
  });
  assert.equal(captured.length, 2);
  assert.equal(captured[0]!.pattern, '0 9 * * 1-5');
  assert.equal(captured[1]!.pattern, '0 9 * * 1');
  assert.equal(captured[0]!.timezone, 'America/New_York');
  assert.equal(handle.nextRun()?.toISOString(), next.toISOString());

  await captured[1]!.onTick(); // fire the weekly job's tick
  assert.deepEqual(ran, ['weekly']);
});

test('startWorker swallows a failing cycle — the worker stays alive', async () => {
  const logs: string[] = [];
  const { factory, captured } = captureScheduler();
  await startWorker(cfg(), secretsWithHook, {
    scheduler: factory,
    runJob: async () => {
      throw new Error('kaboom');
    },
    log: (m) => logs.push(m),
  });
  await assert.doesNotReject(() => Promise.resolve(captured[0]!.onTick()));
  assert.ok(logs.some((l) => /failed: kaboom/.test(l)));
});

test('startWorker rejects when no webhook is configured (and not a dry run)', async () => {
  await assert.rejects(
    () => startWorker(cfg(), secrets, { log: () => {} }),
    /no Discord webhook configured/,
  );
});

test('startWorker --dry-run does not require a webhook', async () => {
  const { factory } = captureScheduler();
  await assert.doesNotReject(() =>
    startWorker(cfg(), secrets, { dryRun: true, scheduler: factory, log: () => {} }),
  );
});

test('handle.stop() stops every scheduled job', async () => {
  let stopped = 0;
  const { factory } = captureScheduler(() => ({ nextRun: () => null, stop: () => void stopped++ }));
  const handle = await startWorker(cfg({ schedule: dailyWeekly }), secretsWithHook, {
    scheduler: factory,
    runJob: async () => {},
    log: () => {},
  });
  handle.stop();
  assert.equal(stopped, 2);
});

// ── Hot reload (opts.watch) ──

const single = (cron: string) => ({
  timezone: 'America/New_York',
  jobs: [{ cron, windowHours: 24, label: 'daily' }],
});

test('hot reload reschedules cron jobs when the schedule changes', async () => {
  let stopped = 0;
  const { factory, captured } = captureScheduler(() => ({ nextRun: () => null, stop: () => void stopped++ }));
  let fire!: (c: Config) => void;
  await startWorker(cfg({ schedule: dailyWeekly }), secretsWithHook, {
    scheduler: factory,
    runJob: async () => {},
    log: () => {},
    watch: (onChange) => {
      fire = onChange;
      return () => {};
    },
  });
  assert.equal(captured.length, 2); // daily + weekly at boot

  fire(cfg({ schedule: single('0 9 * * *') }));
  assert.equal(stopped, 2); // the two boot jobs were torn down
  assert.equal(captured.length, 3); // one new job scheduled
  assert.equal(captured[2]!.pattern, '0 9 * * *');
});

test('hot reload with an unchanged schedule does not reschedule', async () => {
  const { factory, captured } = captureScheduler();
  let fire!: (c: Config) => void;
  await startWorker(cfg({ schedule: dailyWeekly }), secretsWithHook, {
    scheduler: factory,
    runJob: async () => {},
    log: () => {},
    watch: (onChange) => {
      fire = onChange;
      return () => {};
    },
  });
  // Same schedule, different unrelated field — must NOT rebuild cron jobs.
  fire(cfg({ schedule: dailyWeekly, model: 'some-other-model' }));
  assert.equal(captured.length, 2);
});

test('a config reload error is swallowed — the worker stays alive', async () => {
  const logs: string[] = [];
  const { factory } = captureScheduler();
  let onErr!: (e: Error) => void;
  await startWorker(cfg(), secretsWithHook, {
    scheduler: factory,
    runJob: async () => {},
    log: (m) => logs.push(m),
    watch: (_onChange, onError) => {
      onErr = onError;
      return () => {};
    },
  });
  assert.doesNotThrow(() => onErr(new Error('bad json')));
  assert.ok(logs.some((l) => /reload error/.test(l)));
});

test('handle.stop() unsubscribes the config watch', async () => {
  let unsub = 0;
  const { factory } = captureScheduler();
  const handle = await startWorker(cfg(), secretsWithHook, {
    scheduler: factory,
    runJob: async () => {},
    log: () => {},
    watch: () => () => void unsub++,
  });
  handle.stop();
  assert.equal(unsub, 1);
});
