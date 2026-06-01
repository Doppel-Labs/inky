#!/usr/bin/env node
/**
 * Herald CLI. Thin trigger layer over the core pipeline.
 *
 *   herald collect   — fetch + normalize org activity, print as JSON (Phase 1)
 *   herald standup   — collect -> summarize -> render -> deliver (Phases 3–4)
 *   herald serve     — run the standup on a schedule, forever (Phase 4 worker)
 *
 * The CLI only parses args and wires stages together; all real work lives in
 * the host-agnostic core so the worker and a future slash command reuse it.
 */
import 'dotenv/config';
import { loadConfig, loadSecrets, resolveWebhookUrl } from './config.js';

const COMMANDS = ['collect', 'standup', 'serve'] as const;
const PROVIDERS = ['anthropic', 'groq', 'openai'] as const;
type Provider = (typeof PROVIDERS)[number];
const FORMATS = ['prose', 'bullets'] as const;
type Format = (typeof FORMATS)[number];
type Command = (typeof COMMANDS)[number];

function usage(): never {
  console.error(`herald — your team's daily standup, written for you

Usage:
  herald collect [opts]              Fetch and normalize org activity (prints JSON)
  herald standup [opts] [--dry-run]  Build and deliver the standup once
  herald serve [opts] [--once]       Run the standup on a schedule, forever

Options:
  --config <path>   Config file (default: herald.config.json)
  --days <n>        Window length in days (overrides config windowHours)
  --hours <n>       Window length in hours (overrides config windowHours)
  --provider <p>    LLM provider: anthropic | groq | openai (overrides config)
  --model <id>      LLM model id (overrides config model / provider default)
  --stats           Force the team stats panel on (default: auto on weekly+)
  --no-stats        Force the team stats panel off
  --stats-per-person  Add a per-person stat line under each name
  --format <style>  Per-person style: prose (default) | bullets
  --dry-run         Print the standup to stdout instead of posting to Discord
  --once            (serve) Run one cycle now and exit, instead of scheduling
  --mechanical      Skip the AI summary; use the deterministic renderer

Environment:
  GITHUB_TOKEN         GitHub PAT / fine-grained token (repo read)
  ANTHROPIC_API_KEY    Anthropic key (or GROQ_API_KEY / OPENAI_API_KEY)
  DISCORD_WEBHOOK_URL  Discord incoming webhook (preferred over config)
`);
  process.exit(2);
}

interface ParsedArgs {
  command: Command;
  configPath: string;
  dryRun: boolean;
  once: boolean;
  mechanical: boolean;
  windowHours?: number;
  model?: string;
  provider?: Provider;
  /** undefined = use config (auto); true/false = forced by --stats/--no-stats. */
  stats?: boolean;
  statsPerPerson?: boolean;
  format?: Format;
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
  let once = false;
  let mechanical = false;
  let windowHours: number | undefined;
  let model: string | undefined;
  let provider: Provider | undefined;
  let stats: boolean | undefined;
  let statsPerPerson: boolean | undefined;
  let format: Format | undefined;
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
    } else if (rest[i] === '--format') {
      const next = rest[++i];
      if (!next || !FORMATS.includes(next as Format)) usage();
      format = next as Format;
    } else if (rest[i] === '--dry-run') {
      dryRun = true;
    } else if (rest[i] === '--once') {
      once = true;
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
    once,
    mechanical,
    windowHours,
    model,
    provider,
    stats,
    statsPerPerson,
    format,
  };
}

async function main(): Promise<void> {
  const { command, configPath, dryRun, once, mechanical, windowHours, model, provider, stats, statsPerPerson, format } =
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
      const { buildStandup } = await import('./standup.js');
      const { markdown } = await buildStandup(config, secrets, {
        windowHours,
        mechanical,
        format,
        stats,
        statsPerPerson,
        log: (m) => console.error(m),
      });

      const webhookUrl = resolveWebhookUrl(config, secrets);
      if (dryRun || !webhookUrl) {
        if (!webhookUrl && !dryRun) {
          console.error('standup: no Discord webhook configured — printing instead.');
        }
        process.stdout.write(markdown);
        break;
      }
      const { postStandupToDiscord } = await import('./discord.js');
      const { messages, embeds } = await postStandupToDiscord(webhookUrl, markdown);
      console.error(`standup: posted ${embeds} embed(s) in ${messages} message(s) to Discord.`);
      break;
    }
    case 'serve': {
      const { startWorker } = await import('./worker.js');
      const handle = await startWorker(config, secrets, {
        once,
        dryRun,
        log: (m) => console.error(m),
      });
      if (once) break; // ran one cycle, fall through to exit

      // Long-running: keep the process alive and shut down cleanly on signals.
      const shutdown = (sig: string) => {
        console.error(`herald: received ${sig}, stopping worker…`);
        handle.stop();
        process.exit(0);
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      await new Promise<never>(() => {}); // block forever; croner drives the work
      break;
    }
  }
}

main().catch((err: unknown) => {
  console.error(`herald: ${(err as Error).message}`);
  process.exit(1);
});
