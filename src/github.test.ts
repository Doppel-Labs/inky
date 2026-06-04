import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterStaleRepos, type RepoMeta } from './github.js';

const now = new Date('2026-06-03T00:00:00.000Z');
const repos: RepoMeta[] = [
  { name: 'active', pushedAt: '2026-06-02T00:00:00.000Z' }, // 1 day ago
  { name: 'edge', pushedAt: '2026-05-04T00:00:00.000Z' }, // exactly 30 days ago
  { name: 'stale', pushedAt: '2026-04-01T00:00:00.000Z' }, // ~63 days ago
  { name: 'never', pushedAt: null },
];

test('filterStaleRepos with staleDays 0 keeps every repo', () => {
  const r = filterStaleRepos(repos, { staleDays: 0, now });
  assert.deepEqual(r.kept, ['active', 'edge', 'stale', 'never']);
  assert.equal(r.skipped.length, 0);
});

test('filterStaleRepos skips repos past the cutoff (boundary is inclusive)', () => {
  const r = filterStaleRepos(repos, { staleDays: 30, now });
  // cutoff = May 4 00:00; "edge" sits exactly on it → kept; older ones skipped.
  assert.deepEqual(r.kept, ['active', 'edge']);
  assert.deepEqual(
    r.skipped.map((s) => s.name),
    ['stale', 'never'],
  );
});

test('filterStaleRepos treats a never-pushed repo as stale', () => {
  const r = filterStaleRepos([{ name: 'never', pushedAt: null }], { staleDays: 365, now });
  assert.deepEqual(r.kept, []);
  assert.equal(r.skipped[0]!.name, 'never');
});
