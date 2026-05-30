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
  /** Canonical-login -> [alias logins/emails], to merge split identities. */
  aliases: AliasMapSchema.default({}),
  /** Where the standup is posted. Phase 4 fills this in; optional until then. */
  discord: z
    .object({
      webhookUrl: z.string().url().optional(),
      channelId: z.string().optional(),
    })
    .default({}),
  /** LLM tuning. Phase 3. Key itself comes from env (ANTHROPIC_API_KEY). */
  model: z.string().default('claude-opus-4-8'),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Secrets, always from the environment — never the config file. */
export interface Secrets {
  githubToken: string;
  anthropicApiKey?: string;
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
  };
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
