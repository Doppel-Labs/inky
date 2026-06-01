/**
 * buildStandup() — the host-agnostic "produce one standup" step.
 *
 * Collect → (summarize | mechanical) → render, returning the finished markdown
 * plus a little metadata. Delivery is intentionally NOT here: the CLI decides
 * print-vs-post and the worker always posts, but both share this build seam so
 * the trigger layer stays thin. Dependencies (collect, LLM resolution) are
 * injectable so this is unit-tested with fakes — no network — exactly like
 * summarize()'s `create` seam.
 */
import type { Config, Secrets } from './config.js';
import type { OrgActivity, Window } from './types.js';
import { collect as collectImpl, type CollectOptions } from './collect.js';
import { resolveLlm as resolveLlmImpl, PROVIDER_ENV, type ResolvedLlm } from './llm.js';

export type StandupFormat = 'prose' | 'bullets';

export interface BuildStandupOptions {
  /** Override the window length (hours); defaults to config.windowHours. */
  windowHours?: number;
  /** Skip the AI summary and use the deterministic renderer. */
  mechanical?: boolean;
  /** Per-person style; defaults to config.format. */
  format?: StandupFormat;
  /** Force the team stats panel on/off. undefined = auto (config.stats + window). */
  stats?: boolean;
  /** Force per-person stat lines. undefined = follow config + whether stats show. */
  statsPerPerson?: boolean;
  /** Progress sink (defaults to no-op). */
  log?: (msg: string) => void;
  /** Injectable clock, threaded to collect() for deterministic windows/tests. */
  now?: Date;
  /** Injectable dependencies (tests pass fakes; production uses the real ones). */
  deps?: BuildStandupDeps;
}

export interface BuildStandupDeps {
  collect?: (config: Config, secrets: Secrets, opts: CollectOptions) => Promise<OrgActivity>;
  resolveLlm?: (config: Config, secrets: Secrets) => ResolvedLlm | null;
}

export interface BuiltStandup {
  /** Finished Discord-ready markdown. */
  markdown: string;
  /** How the body was produced — for logging/telemetry. */
  via: { provider: string; model: string } | 'mechanical';
  /** The window actually covered (after any windowHours override). */
  window: Window;
  /** True when nobody had activity in the window. */
  empty: boolean;
}

/**
 * Decide whether the team stats panel shows: --stats/--no-stats (the `stats`
 * arg) force it; otherwise config.stats, where 'auto' shows it on weekly+
 * windows but not the daily pulse.
 */
function shouldShowStats(config: Config, isDaily: boolean, forced: boolean | undefined): boolean {
  if (forced !== undefined) return forced;
  if (config.stats === 'on') return true;
  if (config.stats === 'off') return false;
  return !isDaily; // 'auto'
}

export async function buildStandup(
  config: Config,
  secrets: Secrets,
  opts: BuildStandupOptions = {},
): Promise<BuiltStandup> {
  const log = opts.log ?? (() => {});
  const collect = opts.deps?.collect ?? collectImpl;
  const resolveLlm = opts.deps?.resolveLlm ?? resolveLlmImpl;

  const activity = await collect(config, secrets, {
    windowHours: opts.windowHours,
    now: opts.now,
    log,
  });

  // Render decisions are lazy-imported so neither path pays for the other.
  const { detailForWindow } = await import('./summarize.js');
  const { renderMechanical, renderStandup } = await import('./render.js');
  const isDaily = detailForWindow(activity.window).tier === 'daily';
  const showStats = shouldShowStats(config, isDaily, opts.stats);
  // Per-person stats pair with the team panel by default (show where it shows);
  // --stats-per-person forces them on regardless.
  const showPerPerson = opts.statsPerPerson ?? (config.statsPerPerson && showStats);

  const meta = { window: activity.window, empty: activity.people.length === 0 };

  // AI summary when a provider key is present and not opted out; otherwise the
  // deterministic render (also the failure fallback).
  const llm = opts.mechanical ? null : resolveLlm(config, secrets);
  if (llm) {
    try {
      const { summarize } = await import('./summarize.js');
      const standup = await summarize(activity, {
        create: llm.create,
        model: llm.model,
        format: opts.format ?? config.format,
        log,
      });
      log(`standup: summarized with ${llm.provider} (${llm.model}).`);
      return {
        markdown: renderStandup(standup, { showStats, statsPerPerson: showPerPerson }),
        via: { provider: llm.provider, model: llm.model },
        ...meta,
      };
    } catch (err) {
      log(`standup: AI summary failed (${(err as Error).message}); falling back to mechanical.`);
      return { markdown: renderMechanical(activity), via: 'mechanical', ...meta };
    }
  }

  if (!opts.mechanical) {
    log(
      `standup: no ${PROVIDER_ENV[config.provider]} set for provider '${config.provider}' — using mechanical render.`,
    );
  }
  return { markdown: renderMechanical(activity), via: 'mechanical', ...meta };
}
