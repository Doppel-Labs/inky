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
    } else if (rest[i] === '--dry-run') {
      dryRun = true;
    } else if (rest[i] === '--mechanical') {
      mechanical = true;
    } else {
      usage();
    }
  }
  return { command: command as Command, configPath, dryRun, mechanical, windowHours };
}

async function main(): Promise<void> {
  const { command, configPath, dryRun, mechanical, windowHours } = parseArgs(process.argv.slice(2));
  const config = loadConfig(configPath);
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

      // AI summary when a key is present and not explicitly opted out; otherwise
      // the deterministic mechanical render (also the fallback if a call fails).
      const useAi = !mechanical && Boolean(secrets.anthropicApiKey);
      let markdown: string;
      if (useAi) {
        try {
          const { summarize } = await import('./summarize.js');
          const { makeMessagesCreate } = await import('./anthropic.js');
          const create = makeMessagesCreate(secrets.anthropicApiKey!);
          const standup = await summarize(activity, {
            create,
            model: config.model,
            log: (m) => console.error(m),
          });
          markdown = renderStandup(standup);
        } catch (err) {
          console.error(
            `standup: AI summary failed (${(err as Error).message}); falling back to mechanical.`,
          );
          markdown = renderMechanical(activity);
        }
      } else {
        if (!mechanical) {
          console.error('standup: no ANTHROPIC_API_KEY set — using mechanical render.');
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
