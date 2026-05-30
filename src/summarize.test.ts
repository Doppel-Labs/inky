import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundingDigest, computeOrgTotals, summarize } from './summarize.js';
import type { CreateMessageParams, MessageResponse, MessagesCreate } from './summarize.js';
import type { OrgActivity, PersonActivity } from './types.js';

const window = { since: '2026-05-29T00:00:00.000Z', until: '2026-05-30T00:00:00.000Z' };

function emptyTotals(): PersonActivity['totals'] {
  return {
    commits: 0,
    unshippedCommits: 0,
    additions: 0,
    deletions: 0,
    prsOpened: 0,
    prsMerged: 0,
    reviewsGiven: 0,
    issuesOpened: 0,
    issuesClosed: 0,
    repos: 0,
  };
}

function person(login: string, over: Partial<PersonActivity> = {}): PersonActivity {
  return {
    person: { login, displayName: login, emails: [] },
    commits: [],
    pullRequests: [],
    reviews: [],
    issues: [],
    totals: emptyTotals(),
    ...over,
  };
}

const sampleActivity: OrgActivity = {
  org: 'Acme',
  window,
  people: [
    person('dünya', {
      person: { login: 'dünya', displayName: 'Dünya', emails: [] },
      commits: [
        {
          repo: 'web',
          sha: 'a1',
          message: 'wip: new parser',
          additions: 100,
          deletions: 5,
          url: 'https://gh/web/commit/a1',
          authoredAt: window.until,
          unshipped: true,
          branch: 'feat/parser',
        },
        {
          repo: 'web',
          sha: 'b2',
          message: 'tidy imports',
          additions: 3,
          deletions: 3,
          url: 'https://gh/web/commit/b2',
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
      totals: { ...emptyTotals(), commits: 2, unshippedCommits: 1, prsMerged: 1, repos: 1 },
    }),
  ],
};

/** A fake MessagesCreate that records the params and returns a canned tool call. */
function fakeCreate(
  input: unknown,
  record?: { params?: CreateMessageParams },
): MessagesCreate {
  return async (params: CreateMessageParams): Promise<MessageResponse> => {
    if (record) record.params = params;
    return {
      content: [{ type: 'tool_use', name: 'emit_standup', input }],
      usage: { input_tokens: 500, output_tokens: 80, cache_read_input_tokens: 400 },
    };
  };
}

test('computeOrgTotals rolls up per-person totals + distinct repos', () => {
  const activity: OrgActivity = {
    org: 'Acme',
    window,
    people: [
      person('a', {
        commits: [{ repo: 'web', sha: '1', message: 'm', additions: 1, deletions: 0, url: 'u', authoredAt: window.until, unshipped: false }],
        pullRequests: [
          { repo: 'web', number: 1, title: 't', state: 'merged', additions: 1, deletions: 0, url: 'u', createdAt: window.since },
        ],
        totals: { ...emptyTotals(), commits: 3, prsMerged: 2, prsOpened: 1, repos: 1 },
      }),
      person('b', {
        commits: [{ repo: 'api', sha: '2', message: 'm', additions: 1, deletions: 0, url: 'u', authoredAt: window.until, unshipped: true }],
        totals: { ...emptyTotals(), commits: 4, unshippedCommits: 1, prsMerged: 1, repos: 1 },
      }),
    ],
  };
  const t = computeOrgTotals(activity);
  assert.equal(t.contributors, 2);
  assert.equal(t.commits, 7);
  assert.equal(t.unshippedCommits, 1);
  assert.equal(t.prsMerged, 3); // not silently de-duped — straight sum of per-person merges
  assert.equal(t.repos, 2); // web + api, distinct
});

test('buildGroundingDigest includes verified org totals for aggregate claims', () => {
  const digest = buildGroundingDigest(sampleActivity);
  assert.match(digest, /Org totals \(verified/);
  assert.match(digest, /Contributors active: 1/);
  assert.match(digest, /Commits: 2 \(1 unshipped\)/);
  assert.match(digest, /PRs: 1 merged, 0 opened/);
});

test('buildGroundingDigest surfaces shipped + unshipped work with refs', () => {
  const digest = buildGroundingDigest(sampleActivity);
  assert.match(digest, /Organization: Acme/);
  assert.match(digest, /login: dünya/);
  assert.match(digest, /#42 Add login \(web\)/);
  assert.match(digest, /Work in progress.*\n- wip: new parser \(web@feat\/parser\)/);
  assert.match(digest, /Shipped commits.*\n- tidy imports \(web\)/);
});

test('summarize maps model output to people by login', async () => {
  const standup = await summarize(sampleActivity, {
    create: fakeCreate({
      projectSummary: 'Team pushed on the parser; login shipped.',
      people: [
        { login: 'dünya', narrative: 'Working on a new parser (#42 merged).', highlights: ['#42 Add login'] },
      ],
    }),
  });
  assert.equal(standup.org, 'Acme');
  assert.equal(standup.projectSummary, 'Team pushed on the parser; login shipped.');
  assert.equal(standup.people.length, 1);
  assert.equal(standup.people[0]?.person.login, 'dünya');
  assert.equal(standup.people[0]?.narrative, 'Working on a new parser (#42 merged).');
  assert.deepEqual(standup.people[0]?.highlights, ['#42 Add login']);
});

test('summarize matches logins case-insensitively', async () => {
  const standup = await summarize(sampleActivity, {
    create: fakeCreate({
      projectSummary: 's',
      people: [{ login: 'DÜNYA', narrative: 'Matched despite different case.' }],
    }),
  });
  assert.equal(standup.people[0]?.narrative, 'Matched despite different case.');
});

test('summarize falls back to facts when the model omits a person', async () => {
  const standup = await summarize(sampleActivity, {
    create: fakeCreate({ projectSummary: 's', people: [] }),
  });
  assert.equal(standup.people.length, 1);
  assert.match(standup.people[0]?.narrative ?? '', /2 commits \(1 unshipped\)/);
});

test('summarize short-circuits an empty window without calling the model', async () => {
  let called = false;
  const create: MessagesCreate = async () => {
    called = true;
    return { content: [] };
  };
  const standup = await summarize({ org: 'Acme', window, people: [] }, { create });
  assert.equal(called, false);
  assert.equal(standup.people.length, 0);
  assert.match(standup.projectSummary, /No GitHub activity/);
});

test('summarize sends a cached system prompt and forces the tool call', async () => {
  const record: { params?: CreateMessageParams } = {};
  await summarize(sampleActivity, {
    create: fakeCreate({ projectSummary: 's', people: [] }, record),
    model: 'claude-test',
  });
  const p = record.params!;
  assert.equal(p.model, 'claude-test');
  assert.equal(p.system[0]?.cache_control?.type, 'ephemeral');
  assert.equal(p.tool_choice.name, 'emit_standup');
  assert.match(p.messages[0]?.content ?? '', /factual activity digest/);
});

test('summarize throws if the model returns no tool call', async () => {
  const create: MessagesCreate = async () => ({
    content: [{ type: 'text', text: 'I cannot.' }],
  });
  await assert.rejects(() => summarize(sampleActivity, { create }), /did not call emit_standup/);
});
