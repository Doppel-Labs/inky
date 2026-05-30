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
  herald collect [--config <path>]              Fetch and normalize org activity (prints JSON)
  herald standup [--config <path>] [--dry-run]  Build and deliver the standup

Options:
  --config <path>   Config file (default: herald.config.json)
  --dry-run         Print the standup to stdout instead of posting to Discord

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
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (!command || !COMMANDS.includes(command as Command)) usage();
  let configPath = 'herald.config.json';
  let dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--config') {
      const next = rest[i + 1];
      if (!next) usage();
      configPath = next;
      i++;
    } else if (rest[i] === '--dry-run') {
      dryRun = true;
    } else {
      usage();
    }
  }
  return { command: command as Command, configPath, dryRun };
}

async function main(): Promise<void> {
  const { command, configPath, dryRun } = parseArgs(process.argv.slice(2));
  const config = loadConfig(configPath);
  const secrets = loadSecrets();

  switch (command) {
    case 'collect': {
      const { collect } = await import('./collect.js');
      const activity = await collect(config, secrets);
      process.stdout.write(JSON.stringify(activity, null, 2) + '\n');
      break;
    }
    case 'standup': {
      const { collect } = await import('./collect.js');
      const { renderMechanical } = await import('./render.js');
      const activity = await collect(config, secrets);
      const markdown = renderMechanical(activity);

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
