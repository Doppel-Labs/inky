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

/** A scheduler that records what it was handed and returns a controllable job. */
function captureScheduler(job: ScheduledJob): {
  factory: SchedulerFactory;
  captured: { pattern?: string; timezone?: string; onTick?: () => void | Promise<void> };
} {
  const captured: { pattern?: string; timezone?: string; onTick?: () => void | Promise<void> } = {};
  const factory: SchedulerFactory = (pattern, options, onTick) => {
    captured.pattern = pattern;
    captured.timezone = options.timezone;
    captured.onTick = onTick;
    return job;
  };
  return { factory, captured };
}

test('startWorker --once runs a single cycle and does not schedule', async () => {
  let runs = 0;
  const handle = await startWorker(cfg(), secrets, {
    once: true,
    runCycle: async () => {
      runs++;
    },
    log: () => {},
  });
  assert.equal(runs, 1);
  assert.equal(handle.nextRun(), null);
});

test('startWorker passes the cron pattern + timezone to the scheduler and exposes nextRun', async () => {
  const next = new Date('2026-06-02T09:00:00.000Z');
  const { factory, captured } = captureScheduler({ nextRun: () => next, stop: () => {} });
  let runs = 0;
  const handle = await startWorker(
    cfg({ schedule: { cron: '0 9 * * 1-5', timezone: 'America/New_York' } }),
    secretsWithHook,
    { scheduler: factory, runCycle: async () => void runs++, log: () => {} },
  );
  assert.equal(captured.pattern, '0 9 * * 1-5');
  assert.equal(captured.timezone, 'America/New_York');
  assert.equal(handle.nextRun()?.toISOString(), next.toISOString());

  await captured.onTick?.(); // simulate the scheduler firing
  assert.equal(runs, 1);
});

test('startWorker swallows a failing cycle — the worker stays alive', async () => {
  const logs: string[] = [];
  const { factory, captured } = captureScheduler({ nextRun: () => null, stop: () => {} });
  await startWorker(cfg(), secretsWithHook, {
    scheduler: factory,
    runCycle: async () => {
      throw new Error('kaboom');
    },
    log: (m) => logs.push(m),
  });
  await assert.doesNotReject(() => Promise.resolve(captured.onTick?.()));
  assert.ok(logs.some((l) => /scheduled run failed: kaboom/.test(l)));
});

test('startWorker rejects when no webhook is configured (and not a dry run)', async () => {
  await assert.rejects(
    () => startWorker(cfg(), secrets, { log: () => {} }),
    /no Discord webhook configured/,
  );
});

test('startWorker --dry-run does not require a webhook', async () => {
  const { factory } = captureScheduler({ nextRun: () => null, stop: () => {} });
  await assert.doesNotReject(() =>
    startWorker(cfg(), secrets, { dryRun: true, scheduler: factory, log: () => {} }),
  );
});

test('handle.stop() stops the scheduled job', async () => {
  let stopped = false;
  const { factory } = captureScheduler({ nextRun: () => null, stop: () => (stopped = true) });
  const handle = await startWorker(cfg(), secretsWithHook, { scheduler: factory, log: () => {} });
  handle.stop();
  assert.equal(stopped, true);
});
