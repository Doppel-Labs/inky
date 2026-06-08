/**
 * A pluggable source of the live `Config` for the long-running worker, so
 * `inky serve` can pick up config changes WITHOUT a restart. `load()` fetches the
 * current config; `watch()` calls back whenever it changes (and on a load error,
 * so a bad edit is logged rather than fatal).
 *
 * Two implementations exist behind this one interface:
 *   - `fileConfigSource` (here) — backed by the JSON config file. Zero extra
 *     dependencies; it is the ONLY thing a self-hoster needs. The file stays the
 *     default and is never required to involve a database.
 *   - `dbConfigSource` (in @inky/db) — backed by the tenant-config rows, for the
 *     hosted/console tier. It is opt-in and lives in the db package so the core
 *     worker never depends on Postgres.
 *
 * The worker only ever sees `ConfigWatch` (a subscribe function), so it stays
 * decoupled from where config comes from.
 */
import { statSync } from 'node:fs';
import { loadConfig, type Config } from './config.js';

/**
 * Subscribe to config changes. Calls `onChange` with each new, validated config,
 * and `onError` if a reload fails (e.g. a malformed edit) — the caller keeps the
 * previous config in that case. Returns a `stop()` that ends the subscription.
 */
export type ConfigWatch = (
  onChange: (config: Config) => void,
  onError: (err: Error) => void,
) => () => void;

/** A source the worker can both read once and subscribe to for live changes. */
export interface ConfigSource {
  /** Load + validate the current config. */
  load(): Promise<Config>;
  /** Watch for changes. A source that can't watch returns a no-op `stop()`. */
  watch: ConfigWatch;
}

/** Minimal stoppable timer, so the poll loop is injectable in tests. */
export interface PollTimer {
  stop(): void;
}
export type IntervalFn = (onTick: () => void, ms: number) => PollTimer;

const defaultInterval: IntervalFn = (onTick, ms) => {
  const id = setInterval(onTick, ms);
  // Don't let the poller alone keep the process alive — cron/the gateway do that.
  (id as unknown as { unref?: () => void }).unref?.();
  return { stop: () => clearInterval(id) };
};

const defaultMtime = (path: string): number | null => {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null; // missing/unreadable — treated as "no change to react to"
  }
};

export interface FileConfigSourceOptions {
  /** Poll interval (ms) for mtime-based change detection. Default 5000. */
  pollMs?: number;
  /**
   * Read + validate config at the path. Defaults to `loadConfig`. Override to
   * re-apply any CLI overrides (e.g. --provider/--model) on each reload so a hot
   * reload doesn't silently drop them.
   */
  read?: (path: string) => Config;
  /**
   * Return the path's last-modified time in ms, or null if missing/unreadable.
   * Defaults to `fs.statSync`. Injectable for tests.
   */
  mtime?: (path: string) => number | null;
  /** Injectable interval timer (defaults to setInterval). */
  interval?: IntervalFn;
}

/**
 * A config source backed by a JSON file — the default for self-hosting. Watches
 * by polling the file's mtime, which is robust across platforms and editors
 * (atomic saves / rename-on-write) where `fs.watch` is flaky. On a detected
 * change it reloads + validates; a parse/validation failure goes to `onError` and
 * the watcher keeps polling, so a bad edit never takes the worker down.
 *
 * On a read-only mount (e.g. a Render Secret File) the file can't change at
 * runtime, so the watcher simply never fires — harmless. There the file is edited
 * via the platform (which redeploys); the DB source is what enables no-redeploy
 * changes for the hosted tier.
 */
export function fileConfigSource(path: string, opts: FileConfigSourceOptions = {}): ConfigSource {
  const read = opts.read ?? loadConfig;
  const mtime = opts.mtime ?? defaultMtime;
  const interval = opts.interval ?? defaultInterval;
  const pollMs = opts.pollMs ?? 5000;

  return {
    load: async () => read(path),
    watch: (onChange, onError) => {
      let last = mtime(path);
      const timer = interval(() => {
        const cur = mtime(path);
        if (cur === null || cur === last) return; // missing or unchanged
        last = cur;
        try {
          onChange(read(path));
        } catch (err) {
          onError(err as Error);
        }
      }, pollMs);
      return () => timer.stop();
    },
  };
}
