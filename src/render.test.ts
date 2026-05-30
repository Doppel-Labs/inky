import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPromotionPR, renderMechanical, windowLabel } from './render.js';
import type { CommitActivity, OrgActivity, PersonActivity, PullRequestActivity } from './types.js';

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

function commit(over: Partial<CommitActivity> = {}): CommitActivity {
  return {
    repo: 'web',
    sha: Math.random().toString(36).slice(2),
    message: 'do a thing',
    additions: 10,
    deletions: 2,
    url: 'https://gh/web/commit/x',
    authoredAt: window.until,
    unshipped: false,
    ...over,
  };
}

function pr(over: Partial<PullRequestActivity> = {}): PullRequestActivity {
  const number = over.number ?? 1;
  return {
    repo: 'web',
    number,
    title: 'Add feature',
    state: 'merged',
    additions: 10,
    deletions: 1,
    url: `https://gh/web/pull/${number}`,
    createdAt: window.since,
    mergedAt: window.until,
    ...over,
  };
}

test('isPromotionPR flags promotion/merge PRs, not features', () => {
  assert.ok(isPromotionPR('Staging'));
  assert.ok(isPromotionPR('staging → main'));
  assert.ok(isPromotionPR('Promote: pnpm migration + sidebar fix'));
  assert.ok(isPromotionPR('Merge chat overhaul into experimental-local'));
  assert.equal(isPromotionPR('feat(billing): differentiate tiers'), false);
  assert.equal(isPromotionPR('Add llm_thread clip type'), false);
});

test('windowLabel matches the window length', () => {
  const day = (n: number) => `2026-05-${String(n).padStart(2, '0')}T00:00:00.000Z`;
  assert.equal(windowLabel({ since: day(29), until: day(30) }), 'Daily Standup');
  assert.equal(windowLabel({ since: day(27), until: day(30) }), '3-Day Standup');
  assert.equal(windowLabel({ since: day(23), until: day(30) }), 'Weekly Standup');
  assert.match(windowLabel({ since: '2026-05-30T00:00:00.000Z', until: '2026-05-30T06:00:00.000Z' }), /6h/);
});

test('renderMechanical titles a 3-day window as 3-Day Standup, not Daily', () => {
  const md = renderMechanical({
    org: 'Acme',
    window: { since: '2026-05-27T00:00:00.000Z', until: '2026-05-30T00:00:00.000Z' },
    people: [],
  });
  assert.match(md, /# 📋 3-Day Standup — Acme/);
});

test('renderMechanical shows an empty-window message', () => {
  const activity: OrgActivity = { org: 'Acme', window, people: [] };
  const md = renderMechanical(activity);
  assert.match(md, /# 📋 Daily Standup — Acme/);
  assert.match(md, /No GitHub activity/);
});

test('renderMechanical shows a shipped feature PR but hides promotion PRs', () => {
  const p = person('dev', {
    pullRequests: [
      pr({ number: 42, title: 'Add login' }),
      pr({ number: 43, title: 'Staging' }),
    ],
    totals: { ...emptyTotals(), prsMerged: 2 },
  });
  const md = renderMechanical({ org: 'Acme', window, people: [p] });
  assert.match(md, /shipped \[#42\]\(https:\/\/gh\/web\/pull\/42\) Add login/);
  assert.doesNotMatch(md, /#43/); // promotion PR filtered from highlights
});

test('renderMechanical surfaces unshipped commits with branch + stat', () => {
  const p = person('dev', {
    commits: [
      commit({ message: 'wip: new parser', unshipped: true, branch: 'feat/parser' }),
      commit({ message: 'tidy imports', unshipped: false }),
    ],
    totals: { ...emptyTotals(), commits: 2, unshippedCommits: 1 },
  });
  const md = renderMechanical({ org: 'Acme', window, people: [p] });
  assert.match(md, /2 commits \(1 unshipped\)/);
  assert.match(md, /🔧 wip: new parser `web@feat\/parser`/);
});

test('renderMechanical dedupes repeated commit messages (rebases)', () => {
  const p = person('dev', {
    commits: [
      commit({ message: 'same change', sha: 'a' }),
      commit({ message: 'same change', sha: 'b' }),
    ],
    totals: { ...emptyTotals(), commits: 2 },
  });
  const md = renderMechanical({ org: 'Acme', window, people: [p] });
  assert.equal(md.match(/same change/g)?.length, 1);
});

test('renderMechanical uses displayName when it differs from login', () => {
  const p = person('ghlogin', {
    person: { login: 'ghlogin', displayName: 'Real Name', emails: [] },
    totals: { ...emptyTotals(), commits: 1 },
  });
  const md = renderMechanical({ org: 'Acme', window, people: [p] });
  assert.match(md, /## Real Name \(`ghlogin`\)/);
});
