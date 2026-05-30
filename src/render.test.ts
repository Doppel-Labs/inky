import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMechanical } from './render.js';
import type { OrgActivity, PersonActivity } from './types.js';

function person(login: string, over: Partial<PersonActivity> = {}): PersonActivity {
  return {
    person: { login, displayName: login, emails: [] },
    commits: [],
    pullRequests: [],
    reviews: [],
    issues: [],
    totals: {
      commits: 0,
      additions: 0,
      deletions: 0,
      prsOpened: 0,
      prsMerged: 0,
      reviewsGiven: 0,
      issuesOpened: 0,
      issuesClosed: 0,
      repos: 0,
    },
    ...over,
  };
}

const window = { since: '2026-05-29T00:00:00.000Z', until: '2026-05-30T00:00:00.000Z' };

test('renderMechanical shows an empty-window message', () => {
  const activity: OrgActivity = { org: 'Acme', window, people: [] };
  const md = renderMechanical(activity);
  assert.match(md, /# 📋 Daily Standup — Acme/);
  assert.match(md, /No GitHub activity/);
});

test('renderMechanical renders a person with a merged PR and stats', () => {
  const p = person('dev', {
    pullRequests: [
      {
        repo: 'web',
        number: 42,
        title: 'Add login',
        state: 'merged',
        additions: 120,
        deletions: 8,
        url: 'https://gh/web/pull/42',
        createdAt: window.since,
        mergedAt: window.until,
      },
    ],
    totals: { ...person('dev').totals, commits: 3, additions: 120, deletions: 8, prsMerged: 1, repos: 1 },
  });
  const md = renderMechanical({ org: 'Acme', window, people: [p] });
  assert.match(md, /## `dev`/);
  assert.match(md, /3 commits/);
  assert.match(md, /\+120\/−8/);
  assert.match(md, /merged \[#42\]\(https:\/\/gh\/web\/pull\/42\) Add login/);
});

test('renderMechanical uses displayName when it differs from login', () => {
  const p = person('ghlogin', {
    person: { login: 'ghlogin', displayName: 'Real Name', emails: [] },
    totals: { ...person('x').totals, commits: 1 },
  });
  const md = renderMechanical({ org: 'Acme', window, people: [p] });
  assert.match(md, /## Real Name \(`ghlogin`\)/);
});
