import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStandup } from './standup.js';
import { ConfigSchema, type Config, type Secrets } from './config.js';
import type { CollectOptions } from './collect.js';
import type { MessagesCreate } from './summarize.js';
import type { OrgActivity, Window } from './types.js';

const secrets: Secrets = { githubToken: 't' };

function cfg(over: Record<string, unknown> = {}): Config {
  return ConfigSchema.parse({ org: 'Acme', ...over });
}

const weekly: Window = { since: '2026-05-23T00:00:00.000Z', until: '2026-05-30T00:00:00.000Z' };
const daily: Window = { since: '2026-05-29T00:00:00.000Z', until: '2026-05-30T00:00:00.000Z' };

/** One active person (a merged PR + a commit) over the given window. */
function activityFor(window: Window): OrgActivity {
  return {
    org: 'Acme',
    window,
    people: [
      {
        person: { login: 'alice', displayName: 'Alice', emails: [] },
        commits: [
          {
            repo: 'web',
            sha: 'a1',
            message: 'feat: x',
            additions: 10,
            deletions: 1,
            url: 'u',
            authoredAt: window.until,
            unshipped: false,
          },
        ],
        pullRequests: [
          {
            repo: 'web',
            number: 42,
            title: 'Add login',
            state: 'merged',
            additions: 10,
            deletions: 1,
            url: 'https://gh/web/pull/42',
            createdAt: window.since,
            mergedAt: window.until,
          },
        ],
        reviews: [],
        issues: [],
        totals: {
          commits: 1,
          unshippedCommits: 0,
          additions: 10,
          deletions: 1,
          prsOpened: 1,
          prsMerged: 1,
          reviewsGiven: 0,
          issuesOpened: 0,
          issuesClosed: 0,
          repos: 1,
        },
      },
    ],
  };
}

/** Fake collect() that returns a fixture and records the options it was called with. */
function fakeCollect(activity: OrgActivity, record?: { opts?: CollectOptions }) {
  return async (_c: Config, _s: Secrets, opts: CollectOptions): Promise<OrgActivity> => {
    if (record) record.opts = opts;
    return activity;
  };
}

/** Fake resolveLlm() that returns a given MessagesCreate as the anthropic provider. */
function fakeLlm(create: MessagesCreate) {
  return () => ({ create, model: 'fake-model', provider: 'anthropic' as const });
}

/** A MessagesCreate that returns a canned emit_standup tool call. */
function emitCreate(input: unknown): MessagesCreate {
  return async () => ({
    content: [{ type: 'tool_use', name: 'emit_standup', input }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}

const throwingCreate: MessagesCreate = async () => {
  throw new Error('boom');
};

test('buildStandup renders the AI summary with the team stats panel on a weekly window', async () => {
  const res = await buildStandup(cfg(), secrets, {
    deps: {
      collect: fakeCollect(activityFor(weekly)),
      resolveLlm: fakeLlm(
        emitCreate({
          projectSummary: 'Busy week.',
          people: [
            { login: 'alice', narrative: 'Shipped login (#42).', work: [{ repo: 'web', points: ['#42 Add login'] }] },
          ],
        }),
      ),
    },
  });
  assert.deepEqual(res.via, { provider: 'anthropic', model: 'fake-model' });
  assert.equal(res.empty, false);
  assert.match(res.markdown, /Busy week\./);
  assert.match(res.markdown, /Shipped login \(#42\)\./);
  assert.match(res.markdown, /### 📊 Team stats/); // weekly + auto → panel on
});

test('buildStandup omits the stats panel on the daily pulse (auto)', async () => {
  const res = await buildStandup(cfg(), secrets, {
    deps: {
      collect: fakeCollect(activityFor(daily)),
      resolveLlm: fakeLlm(emitCreate({ projectSummary: 'x', people: [{ login: 'alice', narrative: 'y', work: [] }] })),
    },
  });
  assert.doesNotMatch(res.markdown, /Team stats/);
});

test('buildStandup honors --no-stats even on a weekly window', async () => {
  const res = await buildStandup(cfg(), secrets, {
    stats: false,
    deps: {
      collect: fakeCollect(activityFor(weekly)),
      resolveLlm: fakeLlm(emitCreate({ projectSummary: 'x', people: [{ login: 'alice', narrative: 'y', work: [] }] })),
    },
  });
  assert.doesNotMatch(res.markdown, /Team stats/);
});

test('buildStandup falls back to the mechanical render when the AI summary fails', async () => {
  const res = await buildStandup(cfg(), secrets, {
    log: () => {},
    deps: { collect: fakeCollect(activityFor(weekly)), resolveLlm: fakeLlm(throwingCreate) },
  });
  assert.equal(res.via, 'mechanical');
  assert.match(res.markdown, /# 📋 Weekly Standup — Acme/);
  assert.doesNotMatch(res.markdown, /AI-summarized/); // the AI footer is absent
});

test('buildStandup --mechanical never resolves an LLM', async () => {
  let resolveCalled = false;
  const res = await buildStandup(cfg(), secrets, {
    mechanical: true,
    deps: {
      collect: fakeCollect(activityFor(daily)),
      resolveLlm: () => {
        resolveCalled = true;
        return null;
      },
    },
  });
  assert.equal(resolveCalled, false);
  assert.equal(res.via, 'mechanical');
});

test('buildStandup uses the mechanical render when no provider key is set', async () => {
  const res = await buildStandup(cfg(), secrets, {
    log: () => {},
    deps: { collect: fakeCollect(activityFor(daily)), resolveLlm: () => null },
  });
  assert.equal(res.via, 'mechanical');
});

test('buildStandup threads windowHours to collect and flags an empty window', async () => {
  const rec: { opts?: CollectOptions } = {};
  const res = await buildStandup(cfg(), secrets, {
    windowHours: 72,
    mechanical: true,
    deps: { collect: fakeCollect({ org: 'Acme', window: daily, people: [] }, rec) },
  });
  assert.equal(rec.opts?.windowHours, 72);
  assert.equal(res.empty, true);
  assert.match(res.markdown, /No GitHub activity/);
});
