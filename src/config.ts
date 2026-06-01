/**
 * Config-as-data. The same core pipeline runs self-hosted or multi-tenant by
 * loading one config object: which org/repos to read, where to post, the alias
 * map, and tuning. Secrets come from the environment, never the config file.
 */
import { readFileSync, existsSync } from 'node:fs';
import { z } from 'zod';

/** Maps a canonical GitHub login -> alias logins/emails to collapse into it. */
export const AliasMapSchema = z.record(z.string(), z.array(z.string()));
export type AliasMap = z.infer<typeof AliasMapSchema>;

export const ConfigSchema = z.object({
  /** GitHub org/owner to read activity from. */
  org: z.string().min(1),
  /**
   * Repos to include. Empty = all repos in the org the token can see.
   * Names are repo-only (no owner prefix); the org is applied.
   */
  repos: z.array(z.string()).default([]),
  /** Standup window length in hours (default 24). */
  windowHours: z.number().int().positive().default(24),
  /** Exclude bot accounts (logins ending in `[bot]`) from the standup. */
  excludeBots: z.boolean().default(true),
  /**
   * Extra glob patterns to exclude from LOC counts, on top of the built-in
   * defaults (lockfiles, generated code, venvs, build dirs, caches). Use for
   * repo-specific generated paths, e.g. "**\/*.snapshot" or "db/seed/**".
   */
  extraNoisePatterns: z.array(z.string()).default([]),
  /** Canonical-login -> [alias logins/emails], to merge split identities. */
  aliases: AliasMapSchema.default({}),
  /**
   * Where the standup is posted. The webhook URL is sensitive (anyone holding it
   * can post to your channel), so prefer the DISCORD_WEBHOOK_URL env var — env
   * wins over this. Kept here too for convenient local/self-host setups.
   */
  discord: z
    .object({
      webhookUrl: z.string().url().optional(),
      channelId: z.string().optional(),
    })
    .default({}),
  /**
   * When the long-running worker (`herald serve`) posts the standup. `cron` is a
   * standard 5-field expression; `timezone` is an IANA name (DST-aware). Keep
   * windowHours in step with the cadence — 24 for a daily 9am post, 168 for a
   * weekly one. Default: 9am every day, UTC. (Weekdays only: "0 9 * * 1-5".)
   */
  schedule: z
    .object({
      cron: z.string().default('0 9 * * *'),
      timezone: z.string().default('UTC'),
    })
    .default({}),
  /**
   * Which LLM provider writes the summary. The core is provider-agnostic (one
   * injected call seam); these just pick the adapter and key:
   *   - anthropic: Claude (best grounded quality; the default). Key: ANTHROPIC_API_KEY.
   *   - groq:      open-weight models on Groq (fast/cheap). Key: GROQ_API_KEY.
   *   - openai:    OpenAI or any OpenAI-compatible endpoint. Key: OPENAI_API_KEY.
   */
  provider: z.enum(['anthropic', 'groq', 'openai']).default('anthropic'),
  /**
   * Override the API base URL (OpenAI-compatible providers only — Groq, OpenAI,
   * OpenRouter, a local Ollama, etc.). Omit to use the provider's default.
   */
  baseUrl: z.string().url().optional(),
  /**
   * Model id. Omit to use a sensible per-provider default (Claude for anthropic,
   * Llama for groq, GPT for openai). Key itself always comes from env, not here.
   */
  model: z.string().optional(),
  /**
   * Team stats panel in the AI standup: 'auto' shows it on weekly+ windows but
   * not the daily pulse; 'on' always; 'off' never. CLI --stats/--no-stats override.
   */
  stats: z.enum(['auto', 'on', 'off']).default('auto'),
  /**
   * Add a per-person stat line under each name. On by default and paired with the
   * team panel (shows wherever team stats show — i.e. weekly+); CLI --stats-per-person
   * forces it on even on the daily pulse. Set false to keep the post team-level only.
   */
  statsPerPerson: z.boolean().default(true),
  /**
   * Per-person output style: 'bullets' (default — scannable bullet points) or
   * 'prose' (narrative paragraph). CLI --format overrides. The project summary
   * stays prose either way.
   */
  format: z.enum(['prose', 'bullets']).default('bullets'),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Secrets, always from the environment — never the config file. */
export interface Secrets {
  githubToken: string;
  anthropicApiKey?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
  /** Discord incoming-webhook URL. Sensitive, so it lives in env, not config. */
  discordWebhookUrl?: string;
}

export function loadSecrets(env: NodeJS.ProcessEnv = process.env): Secrets {
  const githubToken = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (!githubToken) {
    throw new Error(
      'Missing GitHub token. Set GITHUB_TOKEN (a PAT or fine-grained token with repo read access).',
    );
  }
  return {
    githubToken,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    groqApiKey: env.GROQ_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
  };
}

/**
 * Where to post the standup. The webhook URL is a secret, so the env var
 * (DISCORD_WEBHOOK_URL) takes precedence over config.discord.webhookUrl — that
 * keeps it out of committed config and lets a hosted worker inject it. Returns
 * undefined when neither is set (callers fall back to printing).
 */
export function resolveWebhookUrl(config: Config, secrets: Secrets): string | undefined {
  return secrets.discordWebhookUrl ?? config.discord.webhookUrl;
}

/**
 * Load and validate config from a JSON file. Defaults to herald.config.json in
 * the current directory. Throws a readable error on malformed config.
 */
export function loadConfig(path = 'herald.config.json'): Config {
  if (!existsSync(path)) {
    throw new Error(
      `Config not found at ${path}. Copy herald.config.example.json to ${path} and set your org/repos.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${(err as Error).message}`);
  }
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config in ${path}:\n${details}`);
  }
  return result.data;
}
