/**
 * summarize() — turn normalized OrgActivity into an AI-written Standup.
 *
 * This is "the actual product" (plan §6, Phase 3): a clean per-person narrative
 * plus a project-wide summary, written by Claude. The hard rule is *grounding* —
 * the model summarizes, it does not invent. We feed it a factual digest built
 * straight from the activity (the same facts renderMechanical shows) and force a
 * structured tool call back, so every narrative maps to a real login and we never
 * have to parse free-form prose.
 *
 * The network call is injected as a narrow `MessagesCreate` function (mirrors the
 * SDK's messages.create) so this module is unit-testable with a fake client,
 * exactly like the Discord delivery layer. The real adapter lives in anthropic.ts.
 */
import { z } from 'zod';
import { windowLabel } from './render.js';
import type {
  CommitActivity,
  OrgActivity,
  PersonActivity,
  PersonStandup,
  Standup,
} from './types.js';

// ── Narrow LLM-call interface (mocked in tests, wrapped over the SDK in prod) ──

/** A `system` content block; cache_control marks the cacheable (stable) prefix. */
export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface CreateMessageParams {
  model: string;
  max_tokens: number;
  system: SystemBlock[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: Tool[];
  tool_choice: { type: 'tool'; name: string };
}

export interface ToolUseBlock {
  type: 'tool_use';
  name: string;
  input: unknown;
}
export interface TextBlock {
  type: 'text';
  text: string;
}
export type ContentBlock = ToolUseBlock | TextBlock | { type: string; [k: string]: unknown };

export interface MessageResponse {
  content: ContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/** Mirrors `anthropic.messages.create`. The real one is a one-line wrapper. */
export type MessagesCreate = (params: CreateMessageParams) => Promise<MessageResponse>;

// ── Prompt + structured-output contract ──────────────────────────────────────

const TOOL_NAME = 'emit_standup';

/** Tone + grounding rules. Stable across runs, so it's the cached system prefix. */
const SYSTEM_PROMPT = `You write a team's daily engineering standup from GitHub activity.

You are given a factual digest of what each person did (commits, pull requests,
reviews, issues) in a time window. Your job is to turn it into a concise, readable
standup — NOT to evaluate, praise, or speculate.

Hard rules:
- GROUND EVERYTHING in the digest. Never invent work, intent, or outcomes that
  aren't stated. If the digest is thin, the narrative is short. Do not pad.
- Summarize across commits — describe themes of work, not a list of every commit.
- Reference concrete artifacts where natural: PR numbers as "#123", repo names,
  and call out work-in-progress (unshipped) effort explicitly.
- Per person: 1–3 sentences, present tense ("Shipped…", "Working on…"). No filler,
  no adjectives like "great"/"solid", no manager-speak.
- The project summary: 1–3 sentences on what the team collectively moved today —
  the through-line, what shipped vs. what's in flight. No per-person repetition.
- Write for engineers reading their own team's update. Plain, direct, specific.

Return your answer ONLY by calling the ${TOOL_NAME} tool.`;

const EMIT_TOOL: Tool = {
  name: TOOL_NAME,
  description: 'Emit the finished standup: a project-wide summary and one entry per active person.',
  input_schema: {
    type: 'object',
    properties: {
      projectSummary: {
        type: 'string',
        description: 'Project-wide summary, 1–3 sentences, grounded in the digest.',
      },
      people: {
        type: 'array',
        description: 'One entry per active person from the digest.',
        items: {
          type: 'object',
          properties: {
            login: { type: 'string', description: 'The GitHub login exactly as in the digest.' },
            narrative: { type: 'string', description: '1–3 sentence narrative for this person.' },
            highlights: {
              type: 'array',
              description: 'Up to 3 short bullet highlights with refs (PR #, repo). Optional.',
              items: { type: 'string' },
            },
          },
          required: ['login', 'narrative'],
        },
      },
    },
    required: ['projectSummary', 'people'],
  },
};

/** Validates the model's tool input before we trust it. */
const StandupOutputSchema = z.object({
  projectSummary: z.string(),
  people: z
    .array(
      z.object({
        login: z.string(),
        narrative: z.string(),
        highlights: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

// ── Grounding digest ─────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

/** Deduplicate commits by message+repo (rebases/cherry-picks repeat), drop merges. */
function meaningfulCommits(commits: CommitActivity[]): CommitActivity[] {
  const seen = new Set<string>();
  const out: CommitActivity[] = [];
  for (const c of commits) {
    if (/^merge\b/i.test(c.message)) continue;
    const key = `${c.repo}:${c.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function personStatLine(p: PersonActivity): string {
  const t = p.totals;
  const parts: string[] = [];
  if (t.commits) parts.push(`${t.commits} commits (${t.unshippedCommits} unshipped)`);
  if (t.additions || t.deletions) parts.push(`+${fmtNum(t.additions)}/−${fmtNum(t.deletions)} LOC`);
  if (t.prsOpened) parts.push(`${t.prsOpened} PRs opened`);
  if (t.prsMerged) parts.push(`${t.prsMerged} PRs merged`);
  if (t.reviewsGiven) parts.push(`${t.reviewsGiven} reviews`);
  if (t.issuesOpened) parts.push(`${t.issuesOpened} issues opened`);
  if (t.issuesClosed) parts.push(`${t.issuesClosed} issues closed`);
  if (t.repos > 1) parts.push(`${t.repos} repos`);
  return parts.join(', ');
}

/**
 * Build the factual per-person digest the model summarizes. This — not raw API
 * data — is the model's entire source of truth, so it must be complete and clean.
 */
export function buildGroundingDigest(activity: OrgActivity): string {
  const { org, window, people } = activity;
  const lines: string[] = [];
  lines.push(`Organization: ${org}`);
  lines.push(`Window: ${window.since} → ${window.until} (${windowLabel(window)})`);
  lines.push(`Active contributors: ${people.length}`);
  lines.push('');

  for (const p of people) {
    const name =
      p.person.displayName && p.person.displayName !== p.person.login
        ? `${p.person.displayName} (login: ${p.person.login})`
        : `login: ${p.person.login}`;
    lines.push(`### ${name}`);
    const stat = personStatLine(p);
    if (stat) lines.push(`Totals: ${stat}`);

    const mergedFeature = p.pullRequests.filter((pr) => pr.state === 'merged');
    if (mergedFeature.length) {
      lines.push('Merged PRs:');
      for (const pr of mergedFeature.slice(0, 10)) {
        lines.push(`- #${pr.number} ${pr.title} (${pr.repo})`);
      }
    }
    const openPrs = p.pullRequests.filter((pr) => pr.state === 'open' || pr.state === 'draft');
    if (openPrs.length) {
      lines.push('Open PRs:');
      for (const pr of openPrs.slice(0, 10)) {
        lines.push(`- #${pr.number} ${pr.title} (${pr.repo})${pr.state === 'draft' ? ' [draft]' : ''}`);
      }
    }

    const commits = meaningfulCommits(p.commits);
    const unshipped = commits.filter((c) => c.unshipped);
    const shipped = commits.filter((c) => !c.unshipped);
    if (unshipped.length) {
      lines.push('Work in progress (unshipped commits on feature branches):');
      for (const c of unshipped.slice(0, 15)) {
        lines.push(`- ${c.message} (${c.repo}${c.branch ? `@${c.branch}` : ''})`);
      }
    }
    if (shipped.length) {
      lines.push('Shipped commits (on default branch):');
      for (const c of shipped.slice(0, 15)) {
        lines.push(`- ${c.message} (${c.repo})`);
      }
    }

    if (p.reviews.length) {
      const reviewed = p.reviews
        .slice(0, 8)
        .map((r) => `#${r.pullRequestNumber} "${r.pullRequestTitle}" (${r.repo})`);
      lines.push(`Reviewed ${p.reviews.length} PRs: ${reviewed.join('; ')}`);
    }

    const issues = p.issues.filter((i) => i.action === 'opened' || i.action === 'closed');
    if (issues.length) {
      lines.push('Issues:');
      for (const i of issues.slice(0, 8)) {
        lines.push(`- ${i.action} #${i.number} ${i.title} (${i.repo})`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

// ── summarize() ──────────────────────────────────────────────────────────────

export interface SummarizeOptions {
  /** Injected LLM call. The real one wraps anthropic.messages.create. */
  create: MessagesCreate;
  /** Model id (defaults to config). */
  model?: string;
  /** Max output tokens (default 2048; per-person narratives are short). */
  maxTokens?: number;
  log?: (msg: string) => void;
}

/** Extract the first tool_use block named emit_standup. */
function extractToolInput(res: MessageResponse): unknown {
  for (const block of res.content) {
    if (block.type === 'tool_use' && (block as ToolUseBlock).name === TOOL_NAME) {
      return (block as ToolUseBlock).input;
    }
  }
  throw new Error(`summarize: model did not call ${TOOL_NAME} (no tool_use block in response)`);
}

/** A plain factual fallback if the model omits a person the digest included. */
function fallbackNarrative(p: PersonActivity): string {
  const stat = personStatLine(p);
  return stat ? `Activity: ${stat}.` : 'No notable activity in this window.';
}

/**
 * Turn normalized activity into an AI-written Standup. One model call covers the
 * whole org (cheaper, and gives the project summary cross-person context). Every
 * person in the digest gets a section — a model omission falls back to facts.
 */
export async function summarize(activity: OrgActivity, opts: SummarizeOptions): Promise<Standup> {
  const { org, window, people } = activity;
  const log = opts.log ?? (() => {});

  // No activity → no need to spend a token; the empty standup is fully factual.
  if (people.length === 0) {
    return { org, window, projectSummary: 'No GitHub activity in this window.', people: [] };
  }

  const digest = buildGroundingDigest(activity);
  const res = await opts.create({
    model: opts.model ?? 'claude-haiku-4-5',
    max_tokens: opts.maxTokens ?? 2048,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `Here is today's factual activity digest. Write the standup.\n\n${digest}`,
      },
    ],
    tools: [EMIT_TOOL],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  });

  if (res.usage) {
    const { input_tokens, output_tokens, cache_read_input_tokens } = res.usage;
    log(
      `summarize: ${input_tokens ?? '?'} in / ${output_tokens ?? '?'} out tokens` +
        (cache_read_input_tokens ? ` (${cache_read_input_tokens} cached)` : ''),
    );
  }

  const parsed = StandupOutputSchema.parse(extractToolInput(res));
  const byLogin = new Map(parsed.people.map((e) => [e.login.toLowerCase(), e]));

  const peopleStandups: PersonStandup[] = people.map((p) => {
    const entry = byLogin.get(p.person.login.toLowerCase());
    return {
      person: p.person,
      narrative: entry?.narrative?.trim() || fallbackNarrative(p),
      highlights: entry?.highlights ?? [],
    };
  });

  return { org, window, projectSummary: parsed.projectSummary.trim(), people: peopleStandups };
}
