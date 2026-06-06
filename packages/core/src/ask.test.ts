import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnswer, type AskDeps } from './ask.js';
import type { CreateMessageParams, MessageResponse, MessagesCreate } from './summarize.js';
import type { OrgActivity, PersonActivity } from './types.js';
import type { Config, Secrets } from './config.js';
import { ConfigSchema } from './config.js';

const config: Config = ConfigSchema.parse({ org: 'Acme' });
const secrets: Secrets = { githubToken: 't', anthropicApiKey: 'k' };
const window = { since: '2026-05-29T00:00:00.000Z', until: '2026-05-30T00:00:00.000Z' };

function emptyTotals(): PersonActivity['totals'] {
  return {
    commits: 0, unshippedCommits: 0, additions: 0, deletions: 0, prsOpened: 0,
    prsMerged: 0, reviewsGiven: 0, issuesOpened: 0, issuesClosed: 0, repos: 0,
  };
}

const activity: OrgActivity = {
  org: 'Acme',
  window,
  people: [
    {
      person: { login: 'alice', displayName: 'Alice', emails: [] },
      commits: [],
      pullRequests: [
        {
          repo: 'web', number: 42, title: 'Add login', state: 'merged',
          additions: 10, deletions: 1, url: 'https://gh/web/pull/42',
          createdAt: window.since, mergedAt: window.until,
        },
      ],
      reviews: [],
      issues: [],
      totals: { ...emptyTotals(), prsMerged: 1, repos: 1 },
    },
  ],
};

const emptyActivity: OrgActivity = { org: 'Acme', window, people: [] };

/** A fake create that records the params and returns a forced `answer` tool call. */
function fakeAnswer(answer: string, grounded: boolean): { create: MessagesCreate; calls: CreateMessageParams[] } {
  const calls: CreateMessageParams[] = [];
  const create: MessagesCreate = async (params) => {
    calls.push(params);
    return {
      content: [{ type: 'tool_use', name: 'answer', input: { answer, grounded } }],
      usage: { input_tokens: 100, output_tokens: 20 },
    } satisfies MessageResponse;
  };
  return { create, calls };
}

function deps(over: Partial<AskDeps> & { create?: MessagesCreate } = {}): AskDeps {
  return {
    collect: over.collect ?? (async () => activity),
    resolveLlm:
      over.resolveLlm ??
      (() => (over.create ? { create: over.create, model: 'claude-sonnet-4-6', provider: 'anthropic' } : null)),
  };
}

test('grounded answer: renders the question, answer, and footer; reports provider', async () => {
  const { create, calls } = fakeAnswer('Alice merged #42 (Add login) in web.', true);
  const built = await buildAnswer(config, secrets, { question: 'What did alice ship?', deps: deps({ create }) });

  assert.equal(built.grounded, true);
  assert.deepEqual(built.via, { provider: 'anthropic', model: 'claude-sonnet-4-6' });
  assert.equal(built.empty, false);
  assert.match(built.markdown, /> What did alice ship\?/);
  assert.match(built.markdown, /Alice merged #42/);
  assert.match(built.markdown, /host-yours|standup-footer/); // the host-yours attribution link
  assert.equal(calls.length, 1);
});

test('the model call is well-formed: forced answer tool, grounding prompt, question + digest in the user turn', async () => {
  const { create, calls } = fakeAnswer('…', true);
  await buildAnswer(config, secrets, { question: 'who reviewed the auth PR?', deps: deps({ create }) });

  const p = calls[0]!;
  assert.equal(p.tool_choice.name, 'answer');
  assert.equal(p.tools[0]!.name, 'answer');
  assert.match(p.system[0]!.text, /GROUND EVERYTHING/);
  assert.match(p.messages[0]!.content, /who reviewed the auth PR\?/);
  // the factual digest is included as the model's only source of truth
  assert.match(p.messages[0]!.content, /Org totals/);
});

test('not-grounded: model says it cannot answer → grounded=false, still rendered', async () => {
  const { create } = fakeAnswer("The activity in this window doesn't show why #42 took long.", false);
  const built = await buildAnswer(config, secrets, { question: 'why did #42 take so long?', deps: deps({ create }) });
  assert.equal(built.grounded, false);
  assert.match(built.markdown, /doesn't show why #42/);
});

test('empty window: no model call, a factual no-activity answer', async () => {
  let called = false;
  const create: MessagesCreate = async () => {
    called = true;
    throw new Error('must not call the model on an empty window');
  };
  const built = await buildAnswer(config, secrets, {
    question: 'what shipped?',
    deps: deps({ create, collect: async () => emptyActivity }),
  });
  assert.equal(called, false);
  assert.equal(built.via, 'no-activity');
  assert.equal(built.empty, true);
  assert.equal(built.grounded, false);
  assert.match(built.answer, /no GitHub activity in this window/i);
});

test('no LLM provider key: throws a clear, actionable error (no mechanical fallback)', async () => {
  await assert.rejects(
    () => buildAnswer(config, secrets, { question: 'what shipped?', deps: deps({ /* create omitted → resolveLlm null */ }) }),
    /ask needs an LLM provider key.*ANTHROPIC_API_KEY/s,
  );
});

test('an empty question is rejected', async () => {
  const { create } = fakeAnswer('…', true);
  await assert.rejects(
    () => buildAnswer(config, secrets, { question: '   ', deps: deps({ create }) }),
    /a question is required/,
  );
});

test('a model that ignores the forced tool is an error (no free-text answers)', async () => {
  const create: MessagesCreate = async () => ({ content: [{ type: 'text', text: 'hi' }] });
  await assert.rejects(
    () => buildAnswer(config, secrets, { question: 'what shipped?', deps: deps({ create }) }),
    /did not call answer/,
  );
});
