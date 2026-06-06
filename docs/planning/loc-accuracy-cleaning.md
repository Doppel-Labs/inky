---
created: 2026-06-06
status: reference
author: Claude main session
session: doppellabs-perf-review-jun5 (handoff to Inky build session)
branch: feat/loc-merge-cap-cleaning (empty — no commits yet)
informed_by: A live perf-analysis session that ran `inky collect` against a real org and found Inky's LOC numbers inflated; cross-checked against the team-perf tool which already does this cleaning. Named findings archived privately in team-perf/docs/temp/2026-06-05/ (not in this repo).
notes: Implementation backlog for making Inky's LOC counts accurate — a per-commit cap and merge-commit exclusion. Self-contained so it can be picked up cold in a new session. Both are LOC-only changes; neither affects commit/day counts.
---

# Inky LOC accuracy — cleaning backlog

While using `inky collect` for a real engineering-activity review, two defects made the LOC
numbers misleading. Both are present in `collect()` today. team-perf (the older audit script)
already applies both; Inky does not. **Inky already has the broader noise filter
(`filter.ts` `DEFAULT_NOISE_PATTERNS`) and identity aliases — those are fine.** Only these two
are missing.

## Issue 1 — Per-commit LOC cap (bulk-import filter)  [P1]

**Problem:** Path-based noise filtering can't catch a bulk commit of *real-looking source files*
(a vendored research workspace, a reference-codebase import, an integration checkpoint). One such
commit dominates the entire LOC total.

**Evidence (from a real 60d / 180d review; named details in team-perf):**
- A single `chore: import …` vendored research-workspace commit = **1,312,383 lines** (≈85% of
  that engineer's churn, ≈50% of the whole team's 2-month churn).
- An integration-checkpoint commit = 1,234,775 lines (counted in 2 repos).
- No other commit in 6 months exceeds 300k.

**Fix:** add a config key `maxCommitLines` (default **300_000**). Any single commit whose
`additions + deletions` exceeds it contributes **0 to LOC totals** — but still counts toward
commit counts and active days (matches team-perf semantics). Optionally surface
"N bulk commits excluded" in the stats panel.

## Issue 2 — Exclude merge-commit LOC (`--no-merges`)  [P1]

**Problem:** GitHub reports a merge commit's stats as the full diff of the merged branch. Inky
counts that, so merge commits **double-count** (the branch's real commits are already counted)
and **mis-attribute** (merging someone else's PR credits their branch's LOC to the merger).

**Evidence:** one engineer's net LOC went **118k → 46k** once merges were excluded — ~60% was
merge overhead. 56% of the churn sat in merge commits; 25 of 68 merges were *other people's* PRs
(their branch diffs wrongly credited to the merger).

**Fix:** detect merge commits via `commit.parents.length > 1` in `fetchCommits`; set their
`additions/deletions` to 0 (exclude from LOC) while keeping the commit. Add an `isMerge: boolean`
to `CommitActivity` so consumers can also exclude merges from commit *counts* if desired.

## Where to implement

- `packages/core/src/config.ts` — add `maxCommitLines: z.number().int().positive().default(300_000)`
  to `ConfigSchema` (near `staleDays`, line ~64). Thread into `CollectOptions` if a CLI override
  is wanted.
- `packages/core/src/github.ts` — `fetchCommits`, in the `mapLimit(unique, …)` body where
  `sumRealChurn` sets `additions/deletions` (~lines 220–244):
  - merge: `const isMerge = (c.parents?.length ?? 0) > 1;` → if merge, force `additions=deletions=0`.
  - cap: after computing churn, `if (additions + deletions > maxCommitLines) { additions = deletions = 0; }`
  - pass `maxCommitLines` into `fetchCommits` (currently signature ends with `isNoise`); plumb from
    `collect.ts` → `config.maxCommitLines`.
- `packages/core/src/types.ts` — add `isMerge: boolean` to `CommitActivity` (set from `parents`).
- `packages/core/src/collect.ts` — totals sum `commit.additions/deletions`, so zeroing at source
  flows through automatically; no change needed beyond passing the cap.

## Tests

- `filter.test.ts` or `github.test.ts`: a commit with `parents.length > 1` → LOC excluded, still
  counted as a commit.
- A commit over `maxCommitLines` → LOC excluded, commit/day counts unaffected.
- A normal commit under the cap with one parent → unchanged.

## Acceptance

- Re-running `inky standup --stats --stats-per-person` over a real org no longer shows the 1.3M
  bulk-import spike, and per-person LOC drops to authored-only figures (in our review, one
  engineer's net LOC went 118k → 46k).
- Commit counts and active-day counts are **unchanged** by either filter.

## Status / handoff

- **DONE (both P1s implemented on `feat/loc-merge-cap-cleaning`).** Changes:
  - `config.ts` — added `maxCommitLines` (default 300_000) to `ConfigSchema`.
  - `github.ts` — added pure `cleanCommitChurn(churn, parentCount, maxCommitLines)` helper
    (merge → 0 LOC; over-cap → 0 LOC; commit kept either way), wired into `fetchCommits`
    (which now takes a `maxCommitLines` param and sets `isMerge` from `parents`).
  - `types.ts` — added `isMerge: boolean` to `CommitActivity`.
  - `collect.ts` — passes `config.maxCommitLines` into `fetchCommits`.
  - `github.test.ts` — 6 unit tests on `cleanCommitChurn` (normal / merge / over-cap /
    combined-cap / boundary-inclusive / root-commit). Test fixtures updated for `isMerge`.
  - `README.md` + `inky.config.example.json` — documented both rules and the new key.
- Full analysis + evidence: `team-perf/docs/temp/2026-06-05/` (doppellabs-performance-review +
  per-person profiles). The `--no-merges` / cap notes are also in that review's "Inky gap" section.
- Optional P3 (analysis-only, not required): a "review-merge vs self-merge" / merge-only-day
  classification was useful for the audit but isn't needed in the product.
- Not done (explicitly optional in the design): CLI override for `maxCommitLines`, and surfacing
  "N bulk commits excluded" in the stats panel.
