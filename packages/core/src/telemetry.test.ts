import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigSchema, type Config } from './config.js';
import {
  TelemetryEventSchema,
  configFeatureFlags,
  createTelemetry,
  instanceIdFilePath,
  noopTracker,
  resolveInstanceId,
} from './telemetry.js';

/** A config with telemetry overridden — defaults applied by the schema. */
function configWith(telemetry: Partial<Config['telemetry']> = {}): Config {
  return ConfigSchema.parse({ org: 'acme', telemetry });
}

// --- the wire contract ------------------------------------------------------

test('TelemetryEventSchema accepts a minimal valid envelope', () => {
  const r = TelemetryEventSchema.safeParse({ event: 'heartbeat', instanceId: 'abc', ts: 1 });
  assert.ok(r.success);
});

test('TelemetryEventSchema rejects an unknown event name', () => {
  const r = TelemetryEventSchema.safeParse({ event: 'exfiltrate', instanceId: 'abc', ts: 1 });
  assert.ok(!r.success);
});

test('TelemetryEventSchema rejects non-scalar props (no nested identity payloads)', () => {
  const r = TelemetryEventSchema.safeParse({
    event: 'standup_run',
    instanceId: 'abc',
    ts: 1,
    props: { contributors: ['alice', 'bob'] },
  });
  assert.ok(!r.success, 'arrays/objects in props must be rejected');
});

test('TelemetryEventSchema rejects a long string prop value (content cannot ride along)', () => {
  const r = TelemetryEventSchema.safeParse({
    event: 'ask_run',
    instanceId: 'abc',
    ts: 1,
    props: { question: 'x'.repeat(65) }, // a real prop value is a short flag, not prose
  });
  assert.ok(!r.success, 'string prop values over the cap must be rejected');
});

test('TelemetryEventSchema rejects an over-large props bag (key-count cap)', () => {
  const props: Record<string, number> = {};
  for (let i = 0; i < 17; i++) props[`k${i}`] = i;
  const r = TelemetryEventSchema.safeParse({ event: 'heartbeat', instanceId: 'abc', ts: 1, props });
  assert.ok(!r.success, 'more than the key cap must be rejected');
});

// --- feature flags carry no identities --------------------------------------

test('configFeatureFlags emits coarse modes only, no values', () => {
  const config = ConfigSchema.parse({
    org: 'acme',
    repos: ['secret-repo'],
    stats: 'on',
    provider: 'groq',
    roadmap: { enabled: true },
  });
  const flags = configFeatureFlags(config);
  assert.deepEqual(flags, { statsPanel: 'on', roadmap: true, provider: 'groq' });
  // never leaks the repo name or any identity
  assert.ok(!JSON.stringify(flags).includes('secret-repo'));
});

// --- instance id ------------------------------------------------------------

test('resolveInstanceId returns a pinned id verbatim, without touching the disk', () => {
  let touched = false;
  const id = resolveInstanceId(configWith({ instanceId: 'pinned-123' }), {
    readFile: () => {
      touched = true;
      return undefined;
    },
    writeFile: () => {
      touched = true;
    },
  });
  assert.equal(id, 'pinned-123');
  assert.equal(touched, false);
});

test('resolveInstanceId reads an existing persisted id (trimmed)', () => {
  const id = resolveInstanceId(configWith(), {
    readFile: () => '  existing-uuid\n',
    writeFile: () => assert.fail('must not rewrite an existing id'),
  });
  assert.equal(id, 'existing-uuid');
});

test('resolveInstanceId mints + persists a new id when none exists', () => {
  let written: { path: string; data: string } | undefined;
  const id = resolveInstanceId(configWith(), {
    readFile: () => undefined,
    writeFile: (path, data) => {
      written = { path, data };
    },
    randomUUID: () => 'fresh-uuid',
  });
  assert.equal(id, 'fresh-uuid');
  assert.ok(written?.data.includes('fresh-uuid'));
});

test('resolveInstanceId survives an unwritable state dir (still returns an id)', () => {
  const id = resolveInstanceId(configWith(), {
    readFile: () => undefined,
    writeFile: () => {
      throw new Error('EROFS: read-only file system');
    },
    randomUUID: () => 'ephemeral-uuid',
  });
  assert.equal(id, 'ephemeral-uuid');
});

test('instanceIdFilePath honors INKY_INSTANCE_ID_FILE and INKY_STATE_DIR', () => {
  assert.equal(instanceIdFilePath({ INKY_INSTANCE_ID_FILE: '/x/id' } as NodeJS.ProcessEnv), '/x/id');
  assert.ok(
    instanceIdFilePath({ INKY_STATE_DIR: '/state' } as NodeJS.ProcessEnv).startsWith('/state'),
  );
});

// --- the tracker ------------------------------------------------------------

test('disabled telemetry is the inert noop tracker — never sends', async () => {
  const tracker = createTelemetry(configWith({ enabled: false }), {
    fetch: () => assert.fail('disabled telemetry must not fetch'),
  });
  assert.equal(tracker, noopTracker);
  assert.equal(tracker.active, false);
  await tracker.track('heartbeat');
});

test('enabled but no endpoint records intent but sends nothing', async () => {
  const logs: string[] = [];
  const tracker = createTelemetry(configWith({ enabled: true }), {
    instanceId: 'i',
    fetch: () => assert.fail('no endpoint configured — must not fetch'),
    log: (m) => logs.push(m),
  });
  assert.equal(tracker.enabled, true);
  assert.equal(tracker.active, false);
  await tracker.track('standup_run');
  assert.ok(logs.some((l) => l.includes('no endpoint')));
});

test('enabled + endpoint POSTs a schema-valid envelope', async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const tracker = createTelemetry(
    configWith({ enabled: true, endpoint: 'https://t.example/t' }),
    { instanceId: 'install-1', version: '9.9.9', now: () => 1_700_000_000_000, fetch: fakeFetch },
  );
  await tracker.track('standup_run', { trigger: 'scheduled', windowHours: 24, dryRun: false });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://t.example/t');
  const env = calls[0]!.body;
  // the payload is exactly the contract and nothing more
  assert.deepEqual(env, {
    event: 'standup_run',
    instanceId: 'install-1',
    version: '9.9.9',
    ts: 1_700_000_000,
    props: { trigger: 'scheduled', windowHours: 24, dryRun: false },
  });
  assert.ok(TelemetryEventSchema.safeParse(env).success);
});

test('a fetch failure is swallowed — track never rejects', async () => {
  const tracker = createTelemetry(
    configWith({ enabled: true, endpoint: 'https://t.example/t' }),
    {
      instanceId: 'i',
      fetch: (async () => {
        throw new Error('network down');
      }) as typeof fetch,
    },
  );
  // must resolve, not reject — telemetry can't break the caller
  await tracker.track('heartbeat');
});

test('track omits the props key entirely when there are none', async () => {
  let body: { props?: unknown } | undefined;
  const tracker = createTelemetry(
    configWith({ enabled: true, endpoint: 'https://t.example/t' }),
    {
      instanceId: 'i',
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    },
  );
  await tracker.track('instance_started');
  assert.ok(body && !('props' in body));
});
