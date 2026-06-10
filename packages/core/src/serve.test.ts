import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runServe } from './serve.js';
import { ConfigSchema, type Config, type Secrets } from './config.js';
import type { WorkerHandle } from './worker.js';

const config: Config = ConfigSchema.parse({ org: 'Acme' });
const secrets: Secrets = { githubToken: 't' };
const secretsHook: Secrets = { githubToken: 't', discordWebhookUrl: 'https://discord.com/api/webhooks/1/abc' };
const secretsBot: Secrets = { githubToken: 't', discordBotToken: 'bot' };

const fakeWorker = (calls: string[]): WorkerHandle => ({
  stop: () => void calls.push('worker.stop'),
  nextRun: () => null,
});
/** Inject a waitForShutdown that returns immediately so runServe doesn't hang. */
const noWait = async () => {};

test('runServe --once runs the worker once and returns (no bot, no block)', async () => {
  const calls: string[] = [];
  await runServe(config, secrets, {
    once: true,
    log: () => {},
    startWorker: async (_c, _s, o) => {
      calls.push(`worker(once=${o.once})`);
      return fakeWorker(calls);
    },
    startBot: async () => {
      calls.push('bot');
      return { stop: () => {} };
    },
    waitForShutdown: noWait,
  });
  assert.deepEqual(calls, ['worker(once=true)']);
});

test('runServe starts the worker (with the watch) when a webhook is configured', async () => {
  const calls: string[] = [];
  let passedWatch: unknown;
  const watch = () => () => {};
  await runServe(config, secretsHook, {
    watch,
    log: () => {},
    startWorker: async (_c, _s, o) => {
      passedWatch = o.watch;
      calls.push('worker');
      return fakeWorker(calls);
    },
    waitForShutdown: noWait,
  });
  assert.deepEqual(calls, ['worker']);
  assert.equal(passedWatch, watch); // the reload subscription is threaded through
});

test('runServe starts the bot when a bot token is configured', async () => {
  const calls: string[] = [];
  await runServe(config, secretsBot, {
    dryRun: true, // so the worker also starts; exercises both stops
    log: () => {},
    startWorker: async () => fakeWorker(calls),
    startBot: async () => {
      calls.push('bot');
      return { stop: () => void calls.push('bot.stop') };
    },
    waitForShutdown: async (stopAll) => {
      await stopAll(); // simulate a shutdown signal so we can assert teardown
    },
  });
  assert.ok(calls.includes('bot'));
  assert.ok(calls.includes('worker.stop'));
  assert.ok(calls.includes('bot.stop'));
});

test('runServe throws when there is nothing to run (no webhook/dry-run, no bot)', async () => {
  await assert.rejects(
    () =>
      runServe(config, secrets, {
        log: () => {},
        startWorker: async () => fakeWorker([]),
        waitForShutdown: noWait,
      }),
    /nothing to run/,
  );
});
