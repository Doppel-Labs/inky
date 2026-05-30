import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPromotionPR, renderMechanical, renderStandup, windowLabel } from './render.js';
import type {
  CommitActivity,
  OrgActivity,
  PersonActivity,
  PullRequestActivity,
  Standup,
} from './types.js';

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

test('renderStandup renders the project summary and per-person narratives', () => {
  const standup: Standup = {
    org: 'Acme',
    window,
    projectSummary: 'The team shipped login and is mid-way on the parser.',
    people: [
      {
        person: { login: 'alice', displayName: 'Alice', emails: [] },
        narrative: 'Shipped login (#42) and is working on a new parser.',
        work: [{ repo: 'web', points: ['#42 Add login'] }],
      },
    ],
  };
  const md = renderStandup(standup);
  assert.match(md, /# 📋 Daily Standup — Acme/);
  assert.match(md, /The team shipped login and is mid-way on the parser\./);
  assert.match(md, /## Alice \(`alice`\)/);
  assert.match(md, /Shipped login \(#42\) and is working on a new parser\./);
  assert.match(md, /- #42 Add login/);
  assert.doesNotMatch(md, /\*\*web\*\*/); // single repo → no repo subheader
  assert.match(md, /AI-summarized/);
});

function standupWithStats(): Standup {
  return {
    org: 'Acme',
    window: { since: '2026-05-23T00:00:00.000Z', until: '2026-05-30T00:00:00.000Z' },
    projectSummary: 'Busy week.',
    teamTotals: {
      contributors: 2,
      commits: 40,
      unshippedCommits: 12,
      prsOpened: 9,
      prsMerged: 7,
      reviews: 3,
      issuesOpened: 0,
      issuesClosed: 0,
      repos: 2,
      additions: 12345,
      deletions: 678,
    },
    people: [
      {
        person: { login: 'dev', displayName: 'Dev', emails: [] },
        narrative: 'Did things.',
        work: [],
        totals: {
          commits: 30,
          unshippedCommits: 12,
          additions: 12000,
          deletions: 600,
          prsOpened: 5,
          prsMerged: 4,
          reviewsGiven: 3,
          issuesOpened: 0,
          issuesClosed: 0,
          repos: 2,
        },
      },
    ],
  };
}

test('renderStandup shows the team stats panel only when enabled', () => {
  const s = standupWithStats();
  assert.doesNotMatch(renderStandup(s), /Team stats/); // default off
  const withStats = renderStandup(s, { showStats: true });
  assert.match(withStats, /### 📊 Team stats — this week/);
  assert.match(withStats, /\*\*7\*\* PRs merged, \*\*9\*\* opened/);
  assert.match(withStats, /\*\*40\*\* commits \(\*\*12\*\* unshipped\)/);
  assert.match(withStats, /size, not score/);
});

test('renderStandup adds a per-person stat line only with statsPerPerson', () => {
  const s = standupWithStats();
  assert.doesNotMatch(renderStandup(s, { showStats: true }), /30 commits/);
  const perPerson = renderStandup(s, { statsPerPerson: true });
  assert.match(perPerson, /\*30 commits \(12 unshipped\) · PRs: 4 merged\/5 opened · 3 reviews/);
});

test('renderStandup shows repo subheaders only when a person spans >1 repo', () => {
  const md = renderStandup({
    org: 'Acme',
    window,
    projectSummary: '',
    people: [
      {
        person: { login: 'multi', displayName: 'Multi', emails: [] },
        narrative: '',
        work: [
          { repo: 'application', points: ['#1 ship a thing'] },
          { repo: 'mobile', points: ['#2 bump version'] },
        ],
      },
      {
        person: { login: 'solo', displayName: 'Solo', emails: [] },
        narrative: '',
        work: [{ repo: 'application', points: ['#3 fix a bug'] }],
      },
    ],
  });
  // multi-repo person gets headers + grouped bullets
  assert.match(md, /## Multi[\s\S]*\*\*application\*\*\n- #1 ship a thing[\s\S]*\*\*mobile\*\*\n- #2 bump version/);
  // solo person's single repo gets no header
  assert.match(md, /## Solo \(`solo`\)\n- #3 fix a bug/);
});

test('renderStandup handles an empty window', () => {
  const md = renderStandup({ org: 'Acme', window, projectSummary: '', people: [] });
  assert.match(md, /# 📋 Daily Standup — Acme/);
  assert.match(md, /No GitHub activity/);
});

test('renderMechanical uses displayName when it differs from login', () => {
  const p = person('ghlogin', {
    person: { login: 'ghlogin', displayName: 'Real Name', emails: [] },
    totals: { ...emptyTotals(), commits: 1 },
  });
  const md = renderMechanical({ org: 'Acme', window, people: [p] });
  assert.match(md, /## Real Name \(`ghlogin`\)/);
});
