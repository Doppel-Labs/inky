import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileConfigSource, type IntervalFn } from './config-source.js';
import { ConfigSchema, type Config } from './config.js';

const base = (over: Record<string, unknown> = {}): Config => ConfigSchema.parse({ org: 'Acme', ...over });

/** A manual interval: captures the tick so the test can fire polls itself. */
function manualInterval() {
  let tick: () => void = () => {};
  let stopped = 0;
  const interval: IntervalFn = (cb) => {
    tick = cb;
    return { stop: () => void stopped++ };
  };
  return { interval, poll: () => tick(), stopped: () => stopped };
}

test('fileConfigSource.load reads + validates via the injected reader', async () => {
  const src = fileConfigSource('cfg.json', { read: () => base({ windowHours: 12 }) });
  const c = await src.load();
  assert.equal(c.windowHours, 12);
});

test('fileConfigSource.watch fires onChange only when the mtime advances', () => {
  let mtime = 100;
  let n = 9;
  const { interval, poll } = manualInterval();
  const src = fileConfigSource('cfg.json', {
    mtime: () => mtime,
    read: () => base({ windowHours: ++n }),
    interval,
  });
  const changes: Config[] = [];
  src.watch((c) => changes.push(c), () => {});

  poll(); // mtime unchanged → no reload
  assert.equal(changes.length, 0);

  mtime = 200;
  poll(); // mtime advanced → reload
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.windowHours, 10);
});

test('fileConfigSource.watch routes a bad read to onError and keeps polling', () => {
  let mtime = 100;
  let calls = 0;
  const { interval, poll } = manualInterval();
  const src = fileConfigSource('cfg.json', {
    mtime: () => mtime,
    read: () => {
      calls++;
      if (calls === 1) throw new Error('invalid config');
      return base();
    },
    interval,
  });
  const oks: Config[] = [];
  const errs: Error[] = [];
  src.watch((c) => oks.push(c), (e) => errs.push(e));

  mtime = 200;
  poll(); // first change → read throws → onError, no crash
  assert.equal(errs.length, 1);
  assert.equal(oks.length, 0);

  mtime = 300;
  poll(); // still polling → next change reloads cleanly
  assert.equal(oks.length, 1);
});

test('fileConfigSource.watch stop() halts polling', () => {
  const { interval, stopped } = manualInterval();
  const src = fileConfigSource('cfg.json', { mtime: () => 1, read: () => base(), interval });
  const stop = src.watch(() => {}, () => {});
  stop();
  assert.equal(stopped(), 1);
});
