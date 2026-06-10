/**
 * Anonymous, opt-in usage telemetry — the cheap fix for a self-hosted tool's
 * blind spot. When someone clones and runs Inky we otherwise have zero signal:
 * no install count, no liveness, no feature-usage. This module turns that into a
 * trickle of anonymous counts so the project can tell deployed instances apart
 * from GitHub stars and see which bets get used.
 *
 * THE TRUST CONTRACT (see docs/planning/telemetry-design.md):
 *   - Opt-in. `telemetry.enabled` is false by default; nothing is ever sent
 *     until the operator turns it on. No silent phone-home.
 *   - Anonymous & aggregate. The ENTIRE payload is: an event name, a random
 *     install id, the Inky version, a unix timestamp, and a few scalar counts.
 *     NEVER org/repo names, contributor logins/emails, commit or PR content, or
 *     any key. The envelope schema enforces scalar-only props as a guardrail.
 *   - Invisible to the product. A tracker NEVER throws and NEVER blocks: every
 *     send is fire-and-forget with a short timeout and a swallowed failure. A
 *     telemetry outage can't slow or break a standup.
 *
 * The shared `TelemetryEventSchema` is the wire contract; the ingest validates
 * the exact same shape before it writes a row.
 */
import { randomUUID as nodeRandomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { Config } from './config.js';
import { VERSION } from './version.js';

/** The v1 event set. `ask_run` fires once `/ask` ships; `footer_link_clicked`
 *  is recorded landing-page-side, but lives in the union as the shared contract. */
export const TELEMETRY_EVENTS = [
  'instance_started',
  'heartbeat',
  'standup_run',
  'ask_run',
  'footer_link_clicked',
] as const;
export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[number];

/** Props are deliberately scalar-only — a structural guarantee that no nested
 *  identity payload (a login list, a repo map, content) can ride along. String
 *  values are length-capped too: every real prop is a short flag/enum (a few
 *  chars), so a tight cap makes the envelope structurally unable to carry content. */
export const TelemetryPropValueSchema = z.union([z.string().max(64), z.number(), z.boolean()]);

/** Max distinct prop keys on one event (real events use ≤6). */
const MAX_PROP_KEYS = 16;
export type TelemetryProps = Record<string, z.infer<typeof TelemetryPropValueSchema>>;

/** The complete event envelope — the wire contract shared with the ingest.
 *  Nothing outside these fields is ever sent or accepted. */
export const TelemetryEventSchema = z.object({
  event: z.enum(TELEMETRY_EVENTS),
  /** Anonymous, stable-per-install id. Capped so a bad client can't bloat a row. */
  instanceId: z.string().min(1).max(200),
  /** Inky version, for support + upgrade-adoption signal. */
  version: z.string().max(64).optional(),
  /** Unix seconds (client clock). */
  ts: z.number().int().positive(),
  props: z
    .record(z.string().max(64), TelemetryPropValueSchema)
    .refine((o) => Object.keys(o).length <= MAX_PROP_KEYS, 'too many props')
    .optional(),
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

/**
 * Default ingest endpoint. Left unset until Inky's own ingest is deployed — so
 * an `enabled` instance with no `endpoint` configured wires every event but
 * sends nowhere (a no-op, logged once). Set `telemetry.endpoint` in config, or
 * fill this in, to point events at a real sink (apps/ingest).
 */
export const DEFAULT_TELEMETRY_ENDPOINT: string | undefined = undefined;

const DEFAULT_TIMEOUT_MS = 3000;

/** Coarse, value-free feature flags for `standup_run` props — modes/booleans,
 *  never identities. `statsPanel`/`provider` are enum strings (not secrets). */
export function configFeatureFlags(config: Config): TelemetryProps {
  return {
    statsPanel: config.stats,
    roadmap: config.roadmap.enabled,
    provider: config.provider,
  };
}

// ---------------------------------------------------------------------------
// Instance id — anonymous, stable per install
// ---------------------------------------------------------------------------

export interface InstanceIdDeps {
  env?: NodeJS.ProcessEnv;
  randomUUID?: () => string;
  /** Read the id file; return undefined when absent/unreadable. */
  readFile?: (path: string) => string | undefined;
  /** Persist the id file (best-effort; a failure must not be fatal). */
  writeFile?: (path: string, data: string) => void;
}

/**
 * Where the auto install id is persisted. `INKY_INSTANCE_ID_FILE` overrides;
 * otherwise it's `<INKY_STATE_DIR or cwd>/.inky/instance-id`. On hosts whose
 * disk resets between restarts (some containers), pin `telemetry.instanceId` in
 * config instead so restarts don't read as fresh installs.
 */
export function instanceIdFilePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.INKY_INSTANCE_ID_FILE) return env.INKY_INSTANCE_ID_FILE;
  const base = env.INKY_STATE_DIR ?? join(process.cwd(), '.inky');
  return join(base, 'instance-id');
}

function defaultReadFile(path: string): string | undefined {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  } catch {
    return undefined;
  }
}

function defaultWriteFile(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

/**
 * The anonymous install id. A pinned `telemetry.instanceId` (anything but
 * "auto") wins. Otherwise read the persisted UUID, or mint + persist a new one.
 * Persistence is best-effort: if the write fails we still return a usable id for
 * this run (it just won't be stable across restarts on that host).
 */
export function resolveInstanceId(config: Config, deps: InstanceIdDeps = {}): string {
  const configured = config.telemetry.instanceId;
  if (configured && configured !== 'auto') return configured;

  const env = deps.env ?? process.env;
  const path = instanceIdFilePath(env);
  const read = deps.readFile ?? defaultReadFile;
  const existing = read(path)?.trim();
  if (existing) return existing;

  const id = (deps.randomUUID ?? nodeRandomUUID)();
  const write = deps.writeFile ?? defaultWriteFile;
  try {
    write(path, id + '\n');
  } catch {
    // Best-effort: an unwritable state dir just means a per-run id. Never fatal.
  }
  return id;
}

// ---------------------------------------------------------------------------
// The tracker
// ---------------------------------------------------------------------------

export interface Tracker {
  /** The operator's opt-in intent (config.telemetry.enabled). */
  readonly enabled: boolean;
  /** True only when enabled AND an endpoint is resolved (i.e. sends actually go out). */
  readonly active: boolean;
  /** The anonymous install id used on every event (empty when disabled). */
  readonly instanceId: string;
  /**
   * Record an event. Fire-and-forget: returns a promise that ALWAYS resolves
   * (never rejects) once the send settles, times out, or is skipped. Callers on
   * the hot path should `void` it and move on — it adds no latency and cannot
   * fail the surrounding work.
   */
  track(event: TelemetryEventName, props?: TelemetryProps): Promise<void>;
}

export interface TelemetryDeps {
  version?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  /** Injectable clock (ms epoch); defaults to Date.now. */
  now?: () => number;
  log?: (msg: string) => void;
  /** Override the resolved install id (tests / pinned callers). */
  instanceId?: string;
  /** Per-request timeout before the send is abandoned. */
  timeoutMs?: number;
  /** Override instance-id persistence deps (tests). */
  instanceIdDeps?: InstanceIdDeps;
}

/** A tracker that does nothing — for code paths that always take an optional one. */
export const noopTracker: Tracker = {
  enabled: false,
  active: false,
  instanceId: '',
  track: async () => {},
};

/**
 * Build a tracker from config. Resolves the endpoint (config → default), the
 * anonymous install id, and the version. When disabled (or enabled with no
 * endpoint), returns an inert tracker that records the intent but sends nothing.
 */
export function createTelemetry(config: Config, deps: TelemetryDeps = {}): Tracker {
  const enabled = config.telemetry.enabled;
  const endpoint = config.telemetry.endpoint ?? DEFAULT_TELEMETRY_ENDPOINT;
  const log = deps.log;

  if (!enabled) return noopTracker;

  const instanceId = deps.instanceId ?? resolveInstanceId(config, deps.instanceIdDeps);

  if (!endpoint) {
    // Enabled but nowhere to send — honor the opt-in intent, but don't pretend.
    log?.(
      'inky: telemetry is enabled but no endpoint is configured — set telemetry.endpoint to send events.',
    );
    return { enabled: true, active: false, instanceId, track: async () => {} };
  }

  const version = deps.version ?? VERSION;
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    enabled: true,
    active: true,
    instanceId,
    async track(event, props) {
      const payload: TelemetryEvent = {
        event,
        instanceId,
        version,
        ts: Math.floor(now() / 1000),
        ...(props && Object.keys(props).length ? { props } : {}),
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch {
        // Swallowed by contract: telemetry must never disrupt the product. A
        // dropped event is strictly better than a slowed or broken standup.
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
