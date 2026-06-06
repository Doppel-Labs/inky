/**
 * buildAnswer() — one-shot `/ask`: a grounded answer to a single question about
 * the org's recent GitHub activity. The differentiated, on-trend feature ("ask
 * your codebase what your team actually did") — and a thin sibling of
 * buildStandup: collect → digest → one forced tool call → render.
 *
 * The hard rule is the SAME as the standup's: GROUNDING. The model answers only
 * from the factual digest built straight from GitHub (reused verbatim from
 * summarize.ts); if the digest doesn't contain the answer it says so and sets
 * grounded=false, rather than guessing. That refusal is the moat against a
 * generic "summarize our GitHub" agent. Tier-1 limits (no diffs, no per-PR
 * timing, single window) are documented in docs/planning/ask-feature-design.md.
 *
 * Dependencies (collect, LLM resolution) are injectable so this is unit-tested
 * with fakes — no network — exactly like buildStandup/summarize.
 */
import type { Config, Secrets } from './config.js';
import type { OrgActivity, Window } from './types.js';
import { z } from 'zod';
import { collect as collectImpl, type CollectOptions } from './collect.js';
import { resolveLlm as resolveLlmImpl, PROVIDER_ENV, type ResolvedLlm } from './llm.js';
import {
  buildGroundingDigest,
  detailForWindow,
  type MessageResponse,
  type Tool,
  type ToolUseBlock,
} from './summarize.js';
import { windowLabel, HOST_YOURS_URL } from './render.js';

const TOOL_NAME = 'answer';

/** Output budget for an answer — concise by design; an answer isn't a report. */
const ASK_MAX_TOKENS = 1024;

/** Grounding + tone rules. Stable across runs, so it's the cached system prefix. */
const SYSTEM_PROMPT = `You answer a question about a software team's recent GitHub activity, for an engineer on that team.

You are given a factual digest of what each person did (commits, pull requests,
reviews, issues) in a time window, built straight from GitHub. Answer the user's
question using ONLY that digest.

Hard rules:
- GROUND EVERYTHING in the digest. Never invent commits, PRs, people, numbers,
  intent, or outcomes. Cite concrete artifacts from the digest where they help:
  PR numbers as "#123", repo names, and logins.
- If the digest does NOT contain enough to answer, say so plainly (e.g. "The
  activity in this window doesn't show that") and set grounded=false. Do NOT guess,
  extrapolate, or fill gaps from general knowledge. Grounded-or-silent beats
  plausible-but-wrong.
- The digest covers ONLY the given window. If the question implies a different or
  longer period, answer for what you can see and note that you only see this window.
- For any team-wide or aggregate count, use ONLY the "Org totals" figures verbatim.
  Never sum or estimate across people yourself.
- Be concise and direct — plain engineer-to-engineer. No praise, no manager-speak,
  no speculation about "why" beyond what the digest states.

Return your answer ONLY by calling the ${TOOL_NAME} tool.`;

const ANSWER_TOOL: Tool = {
  name: TOOL_NAME,
  description: 'Emit the grounded answer to the question.',
  input_schema: {
    type: 'object',
    properties: {
      answer: {
        type: 'string',
        description:
          'The answer, in Discord-flavored markdown. Grounded strictly in the digest; ' +
          'cite #PRs, repos, and logins from it. Concise.',
      },
      grounded: {
        type: 'boolean',
        description:
          'true if the digest contained enough to answer the question; false if you could ' +
          'not answer it from the digest (e.g. it asks about something outside the activity given).',
      },
    },
    required: ['answer', 'grounded'],
  },
};

/** Validates the model's tool input before we trust it. */
const AnswerOutputSchema = z.object({
  answer: z.string(),
  grounded: z.boolean(),
});

export interface AskDeps {
  collect?: (config: Config, secrets: Secrets, opts: CollectOptions) => Promise<OrgActivity>;
  resolveLlm?: (config: Config, secrets: Secrets) => ResolvedLlm | null;
}

export interface AskOptions {
  /** The question to answer (required). */
  question: string;
  /** Window length (hours); defaults to config.windowHours. */
  windowHours?: number;
  /** Injectable clock, threaded to collect() for deterministic windows/tests. */
  now?: Date;
  /** Progress sink (defaults to no-op). */
  log?: (msg: string) => void;
  deps?: AskDeps;
}

export interface BuiltAnswer {
  /** Finished Discord-ready markdown (question + window header, answer, footer). */
  markdown: string;
  /** The raw answer text, without the header/footer chrome. */
  answer: string;
  /** Whether the model could answer from the digest (false = couldn't / empty window). */
  grounded: boolean;
  /** How the answer was produced. 'no-activity' = answered without a model call. */
  via: { provider: string; model: string } | 'no-activity';
  /** The window actually covered. */
  window: Window;
  /** True when nobody had activity in the window. */
  empty: boolean;
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Wrap a bare answer in the question/window header + grounded footer. */
function renderAnswer(question: string, window: Window, answer: string): string {
  const q = question.replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  out.push(`> ${q}`);
  out.push(`_${windowLabel(window)} · ${fmtDate(window.since)} → ${fmtDate(window.until)}_`);
  out.push('');
  out.push(answer.trim());
  out.push('');
  out.push('—');
  out.push(
    `_Answered by [Inky 🐙](${HOST_YOURS_URL}) from GitHub activity in this window — grounded in verified facts only._`,
  );
  return out.join('\n').trimEnd() + '\n';
}

/** Extract the first tool_use block named `answer`. */
function extractToolInput(res: MessageResponse): unknown {
  for (const block of res.content) {
    if (block.type === 'tool_use' && (block as ToolUseBlock).name === TOOL_NAME) {
      return (block as ToolUseBlock).input;
    }
  }
  throw new Error(`ask: model did not call ${TOOL_NAME} (no tool_use block in response)`);
}

/**
 * Answer one question about the window's activity. Collect → digest → one grounded
 * forced tool call → render. Short-circuits before the model on an empty window
 * (saves a token) and requires an LLM key (there is no mechanical fallback — `/ask`
 * is inherently an LLM feature, unlike the standup).
 */
export async function buildAnswer(
  config: Config,
  secrets: Secrets,
  opts: AskOptions,
): Promise<BuiltAnswer> {
  const log = opts.log ?? (() => {});
  const question = opts.question?.trim();
  if (!question) throw new Error('ask: a question is required.');

  const collect = opts.deps?.collect ?? collectImpl;
  const resolveLlm = opts.deps?.resolveLlm ?? resolveLlmImpl;

  const activity = await collect(config, secrets, {
    windowHours: opts.windowHours,
    now: opts.now,
    log,
  });
  const window = activity.window;

  // Empty window: a fully factual answer, no model call needed.
  if (activity.people.length === 0) {
    const answer = `There's no GitHub activity in this window (${windowLabel(window)}) to answer that.`;
    return {
      markdown: renderAnswer(question, window, answer),
      answer,
      grounded: false,
      via: 'no-activity',
      window,
      empty: true,
    };
  }

  // `/ask` needs a provider — no mechanical fallback (the standup has one; an
  // answer can't be "rendered" without reasoning).
  const llm = resolveLlm(config, secrets);
  if (!llm) {
    throw new Error(
      `ask needs an LLM provider key — set ${PROVIDER_ENV[config.provider]} for provider '${config.provider}' (or switch provider/model).`,
    );
  }

  // Generous digest caps so specific questions have raw material to draw on.
  const base = detailForWindow(window);
  const detail = { ...base, commitCap: Math.max(base.commitCap, 40), prCap: Math.max(base.prCap, 25) };
  const digest = buildGroundingDigest(activity, detail);

  const res = await llm.create({
    model: llm.model,
    max_tokens: ASK_MAX_TOKENS,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content:
          `Question: ${question}\n\n` +
          `Answer it using ONLY the factual activity digest below. If it isn't answerable ` +
          `from the digest, say so and set grounded=false.\n\n${digest}`,
      },
    ],
    tools: [ANSWER_TOOL],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  });

  if (res.usage) {
    const { input_tokens, output_tokens, cache_read_input_tokens } = res.usage;
    log(
      `ask: ${input_tokens ?? '?'} in / ${output_tokens ?? '?'} out tokens` +
        (cache_read_input_tokens ? ` (${cache_read_input_tokens} cached)` : ''),
    );
  }

  const parsed = AnswerOutputSchema.parse(extractToolInput(res));
  log(`ask: answered with ${llm.provider} (${llm.model})${parsed.grounded ? '' : ' — not answerable from the window'}.`);

  return {
    markdown: renderAnswer(question, window, parsed.answer),
    answer: parsed.answer.trim(),
    grounded: parsed.grounded,
    via: { provider: llm.provider, model: llm.model },
    window,
    empty: false,
  };
}
