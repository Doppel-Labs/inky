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
  herald collect [--config <path>]   Fetch and normalize org activity (prints JSON)
  herald standup [--config <path>]   Build and deliver the standup

Environment:
  GITHUB_TOKEN        GitHub PAT / fine-grained token (repo read)
  ANTHROPIC_API_KEY   Anthropic key (required for 'standup' once AI lands)
`);
  process.exit(2);
}

function parseArgs(argv: string[]): { command: Command; configPath: string } {
  const [command, ...rest] = argv;
  if (!command || !COMMANDS.includes(command as Command)) usage();
  let configPath = 'herald.config.json';
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--config') {
      const next = rest[i + 1];
      if (!next) usage();
      configPath = next;
      i++;
    }
  }
  return { command: command as Command, configPath };
}

async function main(): Promise<void> {
  const { command, configPath } = parseArgs(process.argv.slice(2));
  const config = loadConfig(configPath);
  const secrets = loadSecrets();

  switch (command) {
    case 'collect': {
      // Wired in Phase 1. Validates config + secrets load correctly for now.
      console.error(
        `collect: ready — org=${config.org}, repos=${config.repos.length || 'all'}, ` +
          `token=${secrets.githubToken ? 'present' : 'MISSING'}. Fetch lands in Phase 1.`,
      );
      break;
    }
    case 'standup': {
      console.error('standup: not implemented yet (Phases 3–4). Use `herald collect` for now.');
      process.exit(1);
    }
  }
}

main().catch((err: unknown) => {
  console.error(`herald: ${(err as Error).message}`);
  process.exit(1);
});
