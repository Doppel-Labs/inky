---
created: 2026-06-02
status: active
author: Claude main session
session: aa8bf74f-adef-4f15-a54b-4d2aa9d20e9e
branch: main
informed_by: inky-project-plan.md §5/§7 (reconcile slots between normalize and summarize; Phase 5 = the paid hook); the existing pipeline (collect.ts, github.ts, summarize.ts grounded emit_standup pattern, computeTeamStats, render.ts panels, config.ts zod+DI style); Standup.statusVsPlan placeholder already in types.ts + rendered in render.ts
notes: Implementation blueprint for Phase 5 — reconcile(): tie GitHub activity to a roadmap and add a grounded "status vs plan" block. MVP tracker = GitHub Milestones (no new auth, no GraphQL).
---

# Phase 5 — `reconcile()`: status vs roadmap

> The standup is the hook; **status-vs-roadmap is the value teams pay for** (plan §1–3).
> This block answers "where does the project actually stand vs the plan?" — grounded,
> never invented, mirroring how the stats panel feeds verified figures to the model.

## 1. Placement (unchanged from §5)

```
collect() → [reconcile()] → summarize() → render()
```

`reconcile()` is a **pure function** between collect and summarize. `buildStandup()`
orchestrates it: when roadmap is enabled, fetch the roadmap, `reconcile(activity, roadmap)`
→ a `RoadmapStatus`, attach it to the summarize input + the `Standup`. Everything stays
host-agnostic and dependency-injected (unit-tested with no network), like the rest.

## 2. The MVP source of "the plan": GitHub Milestones

Recommended MVP tracker = **GitHub Milestones**, because:
- **No new auth** — same `GITHUB_TOKEN`, same Octokit. (Linear/Notion need their own tokens.)
- **Progress is free** — a milestone object carries `open_issues`, `closed_issues`, `due_on`.
  No need to list every issue to compute "% done" or "on track vs due date".
- **No GraphQL** — REST `GET /repos/{org}/{repo}/milestones` is enough. (Projects v2 would
  force GraphQL; defer it.)

**Honest caveat (a product decision — see §9):** this assumes teams actually use Milestones.
Many don't. A fast-follow is a **config-declared roadmap** (a list of goals in
`inky.config.json` or a `ROADMAP.md`) so the feature works without GitHub Milestones. The
adapter seam below makes that additive.

## 3. Data model (`types.ts`)

Mirror the stats-panel split: **mechanical aggregates** (never model-counted) + a **grounded
narrative** the model writes from them.

```ts
/** A roadmap item being tracked. MVP: a GitHub milestone. Later: project/epic/declared goal. */
export interface RoadmapItem {
  id: string;                 // stable, e.g. "milestone:web#3"
  kind: 'milestone';          // future: 'project' | 'epic' | 'declared'
  title: string;
  url: string;
  repo: string;
  dueOn?: string;             // ISO, if set
  openCount: number;          // open sub-issues
  closedCount: number;        // closed sub-issues
  state: 'open' | 'closed';
}

export type ItemMovement =
  | 'completed'    // closed this window, or hit 100%
  | 'advanced'     // ≥1 sub-issue closed in-window
  | 'in-progress'  // in-window activity on its issues, no closures
  | 'stalled'      // open, no in-window activity (optionally past/near due)
  | 'untouched';   // open, no activity, not flagged

export interface RoadmapItemStatus {
  item: RoadmapItem;
  movement: ItemMovement;
  closedThisWindow: number;   // sub-issues closed in-window
  progress: number;           // closedCount / (openCount + closedCount), 0..1
  atRisk: boolean;            // dueOn set, work remaining, due within atRiskDays or past
  note?: string;              // short mechanical reason (e.g. "due in 3 days, 4 open")
}

/** The reconciled picture. All figures mechanical — the model must not recompute them. */
export interface RoadmapStatus {
  items: RoadmapItemStatus[];
  unplanned: { closedIssues: number };  // in-window closures with no tracked milestone
  totals: { tracked: number; completed: number; advanced: number; stalled: number; atRisk: number };
}
```

`Standup` (extend; `statusVsPlan` already exists and is already rendered):
```ts
export interface Standup {
  // …existing…
  statusVsPlan?: string;       // model-written, grounded narrative (KEEP)
  roadmap?: RoadmapStatus;     // NEW: mechanical, rendered as a panel
}
```

`IssueActivity` (extend so reconcile can map a closed issue to its milestone with no extra fetch):
```ts
export interface IssueActivity {
  // …existing…
  milestoneNumber?: number;    // NEW: from issue.milestone?.number
}
```

## 4. Fetch layer (`github.ts`)

One new function; one tiny extension. **No GraphQL, no new endpoints beyond milestones.**

```ts
export interface MilestoneRecord {
  repo: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed';
  dueOn?: string;
  openIssues: number;
  closedIssues: number;
}

/** All milestones for a repo (REST GET /repos/{org}/{repo}/milestones?state=all). Cheap. */
export async function fetchMilestones(
  octokit: Octokit, org: string, repo: string,
): Promise<MilestoneRecord[]>;
```

- **Progress + due date** come straight off the milestone object — no issue listing needed.
- **"What closed this window under milestone X"** reuses the issues we already fetch for the
  standup (`fetchIssues`), once `IssueActivity.milestoneNumber` is captured from
  `issue.milestone?.number`. So reconcile needs **no new per-issue fetch**.
- **PR → milestone linkage** (e.g. "Closes #123") is deferred (a `#\d+` heuristic later);
  MVP movement is driven by issue closures, which is the honest signal.

`fetchMilestones` is called only when roadmap is enabled, per repo, in the collect loop (or a
sibling `fetchRoadmap`). Rate cost: one paginated call per repo — negligible next to the
existing all-branch commit traversal.

## 5. `reconcile()` core (new `src/reconcile.ts`)

Pure, deterministic, unit-tested with fixtures. **The heart of Phase 5.**

```ts
export interface ReconcileInput {
  milestones: MilestoneRecord[];        // fetched
  issues: IssueActivity[];              // in-window issues across people (flattened from activity)
  window: Window;
}
export interface ReconcileOptions {
  milestoneFilter?: string;             // substring/glob over titles
  atRiskDays: number;                   // default 7
  now: Date;                            // injected clock (no Date.now in pure core)
}

export function reconcile(input: ReconcileInput, opts: ReconcileOptions): RoadmapStatus;
```

Per milestone (filtered; open milestones, plus any closed in-window):
- `progress = closedIssues / (openIssues + closedIssues)` (0 when empty).
- `closedThisWindow` = count of `issues` with `action === 'closed'` and `milestoneNumber === m.number`.
- `movement`:
  - `completed` — milestone `state === 'closed'`, or progress hit 1 with a closure this window.
  - `advanced` — `closedThisWindow > 0`.
  - `in-progress` — any in-window issue activity on this milestone (opened/closed/commented), no… already covered by advanced; "in-progress" = opened/commented but no closures.
  - `stalled` — `openIssues > 0`, zero in-window activity, AND (past due or no due) — flagged.
  - `untouched` — open, no activity, not stalled-flagged.
- `atRisk = !!dueOn && openIssues > 0 && (due within atRiskDays || past due) && progress < 1`.
- `note` — short mechanical string ("due in 3 days · 4 open", "12 days overdue").

`unplanned.closedIssues` = in-window closed issues with no `milestoneNumber`. `totals` rolls up.

Helper exports for tests: `classifyMovement(...)`, `isAtRisk(...)` (boundary tests, like `classifyPrSize`).

## 6. Summarize wiring (`summarize.ts`)

Grounded, exactly like the stats:
- **Digest** — `buildGroundingDigest` gains a **"Roadmap status (verified figures — do not
  recompute)"** block: one line per tracked item — title, `closedCount/total (NN%)`, movement,
  `closed this window: N`, at-risk + note. Plus the `unplanned`/`totals` rollup.
- **emit_standup tool** — add an optional `statusVsPlan: string` field. The model writes a
  short, grounded narrative of where the project stands vs plan, **referencing only listed
  items and figures**. System prompt: forbid inventing milestone names, progress, or dates;
  forbid summing; defer all numbers to the verified block (same discipline as org totals).
- `summarize()` attaches `roadmap` (mechanical, passed through) + `statusVsPlan` (model text)
  to the returned `Standup`. When roadmap is disabled/empty, neither is set and nothing changes.

Depth: gate the status narrative by window like the stats panel (off on the daily pulse unless
forced; on weekly+), since roadmap status is a weekly-review concern.

## 7. Render (`render.ts`)

A new section, placed **after the project summary, before per-person** (project-level context):

```
## 📍 Status vs plan
<statusVsPlan narrative — grounded prose>

- **<Milestone>** — 7/10 (70%) · advanced (+2 this week) · ⚠️ due in 3 days
- **<Milestone>** — 1/8 (13%) · stalled · 9 days overdue
- 3 issues closed outside any milestone
```

`roadmapPanel(roadmap)` builds the mechanical list (mirrors `teamStatsPanel`). Render only when
`standup.roadmap` exists and has items. Movement → emoji/word; atRisk → ⚠️ + note.

## 8. Config + CLI

```ts
// config.ts
roadmap: z.object({
  enabled: z.boolean().default(false),
  source: z.enum(['github-milestones']).default('github-milestones'), // future: declared/projects/linear/notion
  milestoneFilter: z.string().optional(),     // only track titles matching this
  atRiskDays: z.number().int().positive().default(7),
}).default({}),
```
- Secrets: **still just `GITHUB_TOKEN`** for the MVP.
- CLI: `--roadmap` / `--no-roadmap` force per run (like `--stats`). buildStandup gains the
  fetch+reconcile branch, gated on `config.roadmap.enabled` (or the flag).

## 9. Build sequence (each step testable, no network)

1. **Types** — RoadmapItem/RoadmapItemStatus/RoadmapStatus/ItemMovement; extend `Standup`
   (`roadmap?`) + `IssueActivity` (`milestoneNumber?`).
2. **Fetch** — `fetchMilestones`; capture `milestoneNumber` in issue normalization.
3. **reconcile() core** — pure; the bulk of the tests (movement/progress/atRisk fixtures,
   injected `now`). **Do this thoroughly — it's the product.**
4. **Summarize wiring** — digest roadmap block + emit_standup `statusVsPlan` + grounding rules
   (fake `create` tests).
5. **Render** — `roadmapPanel` + narrative section (render tests).
6. **buildStandup + config/CLI** — enable flag, fetch+reconcile when on (injected-fake tests).
7. **Docs** — config docs, README, plan §9/§10, example config.

## 10. Risks & cutlines

- **Defer:** Projects v2 (GraphQL), PR→issue `#ref` linkage for movement, Linear/Notion
  adapters, cross-repo single roadmaps. The `source` enum + `RoadmapItem.kind` leave room.
- **Hallucination control:** the narrative is the only model-written part; every figure it can
  state is in the verified digest block, and the prompt forbids recomputing — same proven
  discipline as `computeOrgTotals`/`computeTeamStats`.
- **Teams without milestones:** the feature no-ops cleanly (no items → no block). The
  config-declared-roadmap fast-follow (§2 caveat) covers them — additive via the `source` enum.
- **"On track" honesty:** at-risk is purely mechanical (due date + open work); we never claim a
  subjective "on track" the model invented.

## 11. Decisions (resolved 2026-06-02)

1. **Source of "the plan" = GitHub Milestones** for the MVP (user, 2026-06-02). Zero new auth,
   free progress/due-date, no GraphQL. The **config/`ROADMAP.md`-declared roadmap** is the
   deferred fast-follow (additive via the `source` enum) for teams that don't use milestones.
2. **Output shape = mechanical panel + short grounded narrative** (adopted default — matches the
   stats panel; hallucination-resistant).
3. **Movement detection = issue-closure-driven** for the MVP (adopted default); PR/commit `#ref`
   linkage deferred.
