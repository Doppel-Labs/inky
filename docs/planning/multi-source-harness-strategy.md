---
created: 2026-06-05
status: active
author: Claude main session
branch: main
informed_by: the competitor scan (Gitmore/ZeroStandup/Steady — see inky-market-and-growth-strategy.md §6.2 + this thread's live screenshots in .playwright-mcp/); inky-ambitious-strategy.md (Reframe B "the data source is engineering reality, not GitHub" + the wedge→platform thesis); the existing reconcile() design (phase5-reconcile-design.md, the source enum + RoadmapItem abstraction); user product direction in this session (Granola/Notion/Linear sources; abstract the GitHub cron into an agent harness for /ask; keep it scoped, no general assistant; the bidirectional untracked-work insight)
notes: The multi-source direction for Inky — abstract the GitHub-specific pipeline into a source-agnostic agent harness whose tools the scheduled digest AND /ask call across GitHub, Linear, then softer sources (Notion/Granola). Linear is the flagship first non-GitHub source. Core positioning = grounded "intention vs execution" (planned vs shipped vs untracked). Includes the four-quadrant reconciliation model, sequencing, and hard guardrails (Slack = delivery not source; no whole-org ingest; grounding discipline; non-judgmental framing; scope = PMs + engineers).
---

# Inky — Multi-Source Agent Harness (strategy + architecture direction)

## The thesis in one line
Stop being "the GitHub standup bot." Become **the grounded reporter of what a team planned vs. what it actually shipped — across the tools it already uses** — by abstracting today's GitHub pipeline into a **source-agnostic agent harness** that the scheduled digest *and* `/ask` call as tools.

## Why now (the competitive forcing function)
The "GitHub → chat standup" lane has filled in (Gitmore, ZeroStandup, Steady, GitDailies, dailyreport.dev, DCS — see `inky-market-and-growth-strategy.md` §6.2). Two specifics from the live competitor scan:
- **Gitmore** already ships **"Gitmind"** — a grounded chat agent over repo activity. That *is* Inky's `/ask`. The feature is no longer a differentiator on its own; the question is what it answers *across*.
- **ZeroStandup** already pulls 17+ sources (incl. Jira/Trello/Asana/ClickUp) to Slack/Discord/Teams — but produces **shallow text summaries**, no grounded status-vs-plan.

So neither the standup nor multi-source-ingestion is, by itself, defensible anymore. **What remains uncontested:** grounded *status-vs-plan*, cross-functional, OSS/self-hostable. That intersection is this strategy.

## The differentiated positioning: intention vs execution
- **Trackers/docs (Linear, Notion, Granola)** = *what the team said it would do* — issues, cycles, specs, meeting commitments.
- **GitHub** = *what the team actually did* — commits, PRs, reviews, merges.
- **Inky reconciles them** and reports, grounded: *"Cycle 23 is 60% elapsed, 40% of points merged; these 3 issues have no linked PR activity; this PR shipped with no tracked issue."*

This is just the **existing `reconcile()` wedge** (project plan §1 secondary wedge) with the "plan" source upgraded from GitHub milestones to a real tracker. It's cross-functional, grounded, and structurally impossible for git-only Gitmore or summary-only ZeroStandup to copy without becoming a different product.

## The reconciliation is bidirectional — the four-quadrant model
**Critical product insight (user, 2026-06-05):** GitHub can ship work that the tracker never tracked — not everyone opens a ticket for an active task. So reconciliation is gappy in *both* directions and must classify four quadrants, never force a match:

| | **Tracked in Linear/Notion** | **Not tracked** |
|---|---|---|
| **Shipped in GitHub** | ✅ **On track** — issue ↔ linked PR activity | 🟡 **Untracked work** — real work, no ticket (surface it, don't hide it) |
| **Not shipped** | 🔴 **At risk / not started** — issue, no GitHub movement | — (n/a) |

Rules that keep it trustworthy (inherit the existing grounding discipline):
- **Mechanically classify, never invent a link.** A PR with no issue `#ref` is *untracked*, full stop — not a guessed/fuzzy match. (Same discipline as the milestone reconcile: no model-invented "on track.")
- **Untracked work is signal, not a violation.** It surfaces unplanned firefighting, scope creep, "we just did it." Frame it neutrally — **"untracked," never "unauthorized."** Holds the surveillance-perception guardrail (plan §8): team-visibility aid, not a gotcha.
- This two-sided "planned vs shipped vs untracked" view is itself a differentiator — neither git-only nor summary-only competitors can produce it.

## Architecture: the source-agnostic harness
Inky is already shaped for this — the core is host-agnostic, `reconcile()` has a `source` enum, `RoadmapItem` is an abstraction, and `summarize`/`/ask` use the **tool-forced "answer only from fetched facts" pattern** (which *is* an agent-with-tools harness). Adding a source = adding a tool the agent can call. This is the MCP-style pattern; it's the natural extrapolation of what exists, not a rewrite.

Sketch — a narrow `Source` interface every connector implements:
```ts
interface Source {
  id: 'github' | 'linear' | 'github-projects' | 'notion' | 'granola' | …
  // execution facts (what happened) — feeds the digest + reconcile "shipped" side
  collectActivity(window): Promise<Activity[]>
  // plan facts (what was committed to) — feeds reconcile "planned" side
  collectPlan?(window): Promise<RoadmapItem[]>
  // tools the agent may call on demand for /ask (grounded, fetch-on-demand)
  askTools?: AgentTool[]
}
```
- The **scheduled digest** fans out `collectActivity`/`collectPlan` across enabled sources, then runs the existing normalize→reconcile→summarize→render.
- **`/ask`** is the same harness in agentic mode: the LLM calls `askTools` across sources to answer a question, holding the grounding discipline (cite fetched facts, no invention).
- Each source is BYO-key first (like the BYO-LLM-key model) → ships ahead of the hosted OAuth tier.

## Source ranking & sequencing
Linear is the flagship first non-GitHub source — structured (grounded-safe), highest ICP fit, best intention-vs-execution pairing, maps onto existing `reconcile()`, and it's already the #3 sequenced bet in both strategy memos.

| Source | Priority | Notes |
|---|---|---|
| **GitHub** | shipped | execution truth (commits/PRs/reviews) + milestone plan |
| **Linear** | ★ first non-GitHub | cleanest API, ICP's real plan, BYO-key without OAuth, issues already link PRs |
| **GitHub Projects v2** | cheap add | zero new auth (existing GitHub App); for GitHub-native teams w/o Linear |
| **Jira** | later | bigger TAM but enterprise/heavy/slower buyer — only when going upmarket |
| **Shortcut / Asana / ClickUp** | on demand | same adapter pattern; add if users pull |
| **Notion** | after Linear | softer plan source (specs/roadmap docs); structured-ish, opt-in |
| **Granola** | after Notion | meeting commitments — the "we shipped what we agreed in standup" wow; messiest data, do it *after* the harness + grounding are proven |

**Build order:**
1. `/ask` one-shot over GitHub (free tool) — the harness seed; also answers Gitmind directly.
2. Generalize the `Source` tool interface (refactor collect/reconcile behind it).
3. **Linear** (BYO-key) — the flagship reconcile source; the four-quadrant view goes live here.
4. GitHub Projects v2 (free add).
5. Notion, then Granola (softer sources).
6. Cross-functional manager/"Pulse" digest — the paid, manager-facing product (ambitious memo, Gate 2).

This reuses the move both strategy memos already converged on (`/ask` + telemetry first) — we now also know it's the seed of the harness.

## Scope: who first
**PMs + engineers** — the smallest cross-functional pair that makes the intention-vs-execution loop real (PMs own the plan in Linear/Notion/Granola; engineers execute in GitHub). Expand sources/personas only as users pull. This keeps the product narrow and bound to "did we do what we planned," which is the discipline that prevents drift.

## Guardrails (do not cross)
- **Slack is a delivery surface, not a source.** Do **not** ingest a whole org's Slack for "context." It detonates the least-privilege / "activity not surveillance" brand, is a permissions/eng nightmare for a solo maintainer, and is the drift toward general-assistant the product explicitly avoids. Sources are *artifacts produced on purpose* (issues, specs, meeting notes) — not ambient private chat.
- **Not a general personal assistant.** Everything stays bound to engineering/PM activity and the plan-vs-execution loop. If a capability isn't answerable from verified, fetched, work-activity facts, it's out of scope.
- **Grounding discipline scales with sources.** Every new source multiplies the surface for invented claims. Tool-forced emit, cite the source, never paraphrase a transcript into a fabricated fact. The moat is *trustworthy where generic agents hallucinate* — protect it.
- **Non-judgmental framing.** Untracked work and at-risk items are surfaced as team signal, never as individual blame. Size-not-score holds under monetization pressure.

## How this differentiates (vs the field)
| | Gitmore | ZeroStandup | **Inky (this direction)** |
|---|---|---|---|
| Sources | git only | 17+, shallow | git + Linear/tracker + docs/meetings, **grounded** |
| Status-vs-plan | ✗ | ✗ | ✅ four-quadrant, mechanical |
| `/ask` agent | ✅ (Gitmind, git-only) | partial | ✅ **across sources**, grounded |
| Untracked-work view | ✗ | ✗ | ✅ |
| OSS / self-host | ✗ | ✗ | ✅ |
| Discord-native | ✗ (Slack/email) | ✅ (broad/shallow) | ✅ (deep) + Slack later |

## Brand tie-in
The octopus 🐙 is the right metaphor for this exact direction — **many arms reaching into many sources, one grounded brain synthesizing.** Worth leaning into as the visual identity differentiates from Gitmore's beige-editorial look (see the separate design-identity exploration).

## Related docs
- `inky-market-and-growth-strategy.md` — the conservative floor + competitor landscape (§6.2).
- `inky-ambitious-strategy.md` — the ceiling; Reframe B is this doc's seed.
- `roadmap-and-phase-6.md` — tracks, the sequenced bets, Phase 6.
- `phase5-reconcile-design.md` — the existing reconcile()/source-enum/RoadmapItem foundation this builds on.
- `telemetry-design.md` — the measurement prerequisite that gates the whole experiment.
