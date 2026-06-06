import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCommitChurn, filterStaleRepos, type RepoMeta } from './github.js';

const now = new Date('2026-06-03T00:00:00.000Z');
const windowSince = '2026-05-27T00:00:00.000Z'; // 7 days before now (a weekly window start)
const repos: RepoMeta[] = [
  { name: 'active', pushedAt: '2026-06-02T00:00:00.000Z' }, // 1 day ago
  { name: 'edge', pushedAt: '2026-05-04T00:00:00.000Z' }, // 30 days ago
  { name: 'stale', pushedAt: '2026-04-01T00:00:00.000Z' }, // ~63 days ago
  { name: 'never', pushedAt: null },
];

test('staleDays 0 keeps every repo', () => {
  const r = filterStaleRepos(repos, { staleDays: 0, now, windowSince });
  assert.deepEqual(r.kept, ['active', 'edge', 'stale', 'never']);
  assert.equal(r.skipped.length, 0);
});

test('staleDays N skips repos past the fixed cutoff (boundary inclusive)', () => {
  const r = filterStaleRepos(repos, { staleDays: 30, now, windowSince });
  // cutoff = May 4 00:00; "edge" sits exactly on it → kept; older ones skipped.
  assert.deepEqual(r.kept, ['active', 'edge']);
  assert.deepEqual(
    r.skipped.map((s) => s.name),
    ['stale', 'never'],
  );
});

test('staleDays "auto" skips repos with no push since the window started', () => {
  const r = filterStaleRepos(repos, { staleDays: 'auto', now, windowSince });
  // only "active" (Jun 2) was pushed on/after the window start (May 27).
  assert.deepEqual(r.kept, ['active']);
  assert.deepEqual(
    r.skipped.map((s) => s.name),
    ['edge', 'stale', 'never'],
  );
});

test('"auto" keeps a repo pushed exactly at the window start (inclusive)', () => {
  const r = filterStaleRepos([{ name: 'boundary', pushedAt: windowSince }], {
    staleDays: 'auto',
    now,
    windowSince,
  });
  assert.deepEqual(r.kept, ['boundary']);
});

test('filterStaleRepos treats a never-pushed repo as stale', () => {
  const r = filterStaleRepos([{ name: 'never', pushedAt: null }], { staleDays: 365, now, windowSince });
  assert.deepEqual(r.kept, []);
  assert.equal(r.skipped[0]!.name, 'never');
});

// ── cleanCommitChurn: LOC-accuracy cleaning (merge exclusion + bulk-import cap) ──

const CAP = 300_000;

test('cleanCommitChurn leaves a normal single-parent commit unchanged', () => {
  const r = cleanCommitChurn({ additions: 120, deletions: 30 }, 1, CAP);
  assert.deepEqual(r, { additions: 120, deletions: 30, isMerge: false });
});

test('cleanCommitChurn zeroes LOC for a merge commit (>1 parent) and flags it', () => {
  const r = cleanCommitChurn({ additions: 50_000, deletions: 20_000 }, 2, CAP);
  assert.deepEqual(r, { additions: 0, deletions: 0, isMerge: true });
});

test('cleanCommitChurn zeroes LOC for a bulk commit over the cap (not a merge)', () => {
  const r = cleanCommitChurn({ additions: 1_312_383, deletions: 0 }, 1, CAP);
  assert.deepEqual(r, { additions: 0, deletions: 0, isMerge: false });
});

test('cleanCommitChurn caps on additions + deletions combined, not either alone', () => {
  const r = cleanCommitChurn({ additions: 200_000, deletions: 150_000 }, 1, CAP);
  assert.deepEqual(r, { additions: 0, deletions: 0, isMerge: false });
});

test('cleanCommitChurn keeps a commit exactly at the cap (boundary is inclusive)', () => {
  const r = cleanCommitChurn({ additions: CAP, deletions: 0 }, 1, CAP);
  assert.deepEqual(r, { additions: CAP, deletions: 0, isMerge: false });
});

test('cleanCommitChurn flags a root commit (0 parents) as a non-merge', () => {
  const r = cleanCommitChurn({ additions: 10, deletions: 0 }, 0, CAP);
  assert.deepEqual(r, { additions: 10, deletions: 0, isMerge: false });
});
