#!/usr/bin/env node
/**
 * Herald CLI. Thin trigger layer over the core pipeline.
 *
 *   herald collect   — fetch + normalize org activity, print as JSON (Phase 1)
 *   herald standup   — collect -> summarize -> render -> deliver (Phases 3–4)
 *
 * The CLI only parses args and wires stages together; all real work lives in
 * the host-agnostic core so cron and the Discord slash command can reuse it.
 */
import 'dotenv/config';
import { loadConfig, loadSecrets } from './config.js';

const COMMANDS = ['collect', 'standup'] as const;
const PROVIDERS = ['anthropic', 'groq', 'openai'] as const;
type Provider = (typeof PROVIDERS)[number];
type Command = (typeof COMMANDS)[number];

function usage(): never {
  console.error(`herald — your team's daily standup, written for you

Usage:
  herald collect [opts]              Fetch and normalize org activity (prints JSON)
  herald standup [opts] [--dry-run]  Build and deliver the standup

Options:
  --config <path>   Config file (default: herald.config.json)
  --days <n>        Window length in days (overrides config windowHours)
  --hours <n>       Window length in hours (overrides config windowHours)
  --provider <p>    LLM provider: anthropic | groq | openai (overrides config)
  --model <id>      LLM model id (overrides config model / provider default)
  --stats           Force the team stats panel on (default: auto on weekly+)
  --no-stats        Force the team stats panel off
  --stats-per-person  Add a per-person stat line under each name
  --dry-run         Print the standup to stdout instead of posting to Discord
  --mechanical      Skip the AI summary; use the deterministic renderer

Environment:
  GITHUB_TOKEN        GitHub PAT / fine-grained token (repo read)
  ANTHROPIC_API_KEY   Anthropic key (required for 'standup' once AI lands)
`);
  process.exit(2);
}

interface ParsedArgs {
  command: Command;
  configPath: string;
  dryRun: boolean;
  mechanical: boolean;
  windowHours?: number;
  model?: string;
  provider?: Provider;
  /** undefined = use config (auto); true/false = forced by --stats/--no-stats. */
  stats?: boolean;
  statsPerPerson?: boolean;
}

function parsePositiveNumber(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) usage();
  return n;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (!command || !COMMANDS.includes(command as Command)) usage();
  let configPath = 'herald.config.json';
  let dryRun = false;
  let mechanical = false;
  let windowHours: number | undefined;
  let model: string | undefined;
  let provider: Provider | undefined;
  let stats: boolean | undefined;
  let statsPerPerson: boolean | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--config') {
      const next = rest[i + 1];
      if (!next) usage();
      configPath = next;
      i++;
    } else if (rest[i] === '--days') {
      windowHours = parsePositiveNumber(rest[++i]) * 24;
    } else if (rest[i] === '--hours') {
      windowHours = parsePositiveNumber(rest[++i]);
    } else if (rest[i] === '--model') {
      model = rest[++i];
      if (!model) usage();
    } else if (rest[i] === '--provider') {
      const next = rest[++i];
      if (!next || !PROVIDERS.includes(next as Provider)) usage();
      provider = next as Provider;
    } else if (rest[i] === '--stats') {
      stats = true;
    } else if (rest[i] === '--no-stats') {
      stats = false;
    } else if (rest[i] === '--stats-per-person') {
      statsPerPerson = true;
    } else if (rest[i] === '--dry-run') {
      dryRun = true;
    } else if (rest[i] === '--mechanical') {
      mechanical = true;
    } else {
      usage();
    }
  }
  return {
    command: command as Command,
    configPath,
    dryRun,
    mechanical,
    windowHours,
    model,
    provider,
    stats,
    statsPerPerson,
  };
}

async function main(): Promise<void> {
  const { command, configPath, dryRun, mechanical, windowHours, model, provider, stats, statsPerPerson } =
    parseArgs(process.argv.slice(2));
  let config = loadConfig(configPath);
  // CLI overrides (for quick A/B). Switching provider drops the configured
  // model — it belongs to the old provider — so the new provider's default
  // applies unless --model is also given.
  if (provider) config = { ...config, provider, model: undefined };
  if (model) config = { ...config, model };
  const secrets = loadSecrets();

  switch (command) {
    case 'collect': {
      const { collect } = await import('./collect.js');
      const activity = await collect(config, secrets, { windowHours });
      process.stdout.write(JSON.stringify(activity, null, 2) + '\n');
      break;
    }
    case 'standup': {
      const { collect } = await import('./collect.js');
      const { renderMechanical, renderStandup } = await import('./render.js');
      const activity = await collect(config, secrets, { windowHours });

      // Stats panel: --stats/--no-stats force it; otherwise config.stats, where
      // 'auto' shows it on weekly+ windows but not the daily pulse.
      const { detailForWindow } = await import('./summarize.js');
      const isDaily = detailForWindow(activity.window).tier === 'daily';
      const statsMode = config.stats; // 'auto' | 'on' | 'off'
      const showStats = stats ?? (statsMode === 'on' ? true : statsMode === 'off' ? false : !isDaily);
      const showPerPerson = statsPerPerson ?? config.statsPerPerson;

      // AI summary when a provider key is present and not explicitly opted out;
      // otherwise the deterministic mechanical render (also the failure fallback).
      const { resolveLlm, PROVIDER_ENV } = await import('./llm.js');
      const llm = mechanical ? null : resolveLlm(config, secrets);
      let markdown: string;
      if (llm) {
        try {
          const { summarize } = await import('./summarize.js');
          const standup = await summarize(activity, {
            create: llm.create,
            model: llm.model,
            log: (m) => console.error(m),
          });
          console.error(`standup: summarized with ${llm.provider} (${llm.model}).`);
          markdown = renderStandup(standup, { showStats, statsPerPerson: showPerPerson });
        } catch (err) {
          console.error(
            `standup: AI summary failed (${(err as Error).message}); falling back to mechanical.`,
          );
          markdown = renderMechanical(activity);
        }
      } else {
        if (!mechanical) {
          console.error(
            `standup: no ${PROVIDER_ENV[config.provider]} set for provider '${config.provider}' — using mechanical render.`,
          );
        }
        markdown = renderMechanical(activity);
      }

      const webhookUrl = config.discord.webhookUrl;
      if (dryRun || !webhookUrl) {
        if (!webhookUrl && !dryRun) {
          console.error('standup: no discord.webhookUrl configured — printing instead.');
        }
        process.stdout.write(markdown);
        break;
      }
      const { postStandupToDiscord } = await import('./discord.js');
      const { messages, embeds } = await postStandupToDiscord(webhookUrl, markdown);
      console.error(`standup: posted ${embeds} embed(s) in ${messages} message(s) to Discord.`);
      break;
    }
  }
}

main().catch((err: unknown) => {
  console.error(`herald: ${(err as Error).message}`);
  process.exit(1);
});
