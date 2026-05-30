---
created: 2026-05-30
status: active
author: general-purpose agent (metrics research)
session: herald-phase3
branch: main
informed_by: User request to research proper engineering metrics in the age of agentic coding (LOC is misleading); Herald's existing GitHub activity extraction (src/types.ts, collect.ts, github.ts)
notes: Research on engineering productivity/output & code-quality metrics for the agentic-coding era, mapped to what Herald can compute from GitHub data, to inform an optional stats block. Written without live web access — framework descriptions are reliable but specific article URLs/dates are from memory and should be verified before citing externally.
---

# Software-Engineering Productivity & Output Metrics for the Agentic-Coding Era

*Research for Herald's optional stats block.*

> **Scope & honesty note.** This document was written without live web access. The **frameworks** (DORA's four keys, SPACE's five dimensions, DX Core 4) are well-established and stated confidently. **Specific articles, authors, and dates** are recalled from memory and marked **"(from memory, verify)"** — confirm before citing externally. No URLs are invented.

---

## 0. The one-paragraph thesis

Lines-of-code and churn were always weak proxies for value; the agentic-coding shift (AI agents authoring large, syntactically-correct diffs cheaply) breaks them outright. The mature industry frameworks — **DORA**, **SPACE**, and **DX Core 4** — already moved the field toward *flow, outcomes, and quality at the team/system level* and away from *individual output counting*. Herald's job in a public team Discord is to surface a small set of **flow- and quality-oriented, team-level** signals it can derive purely from GitHub activity, framed to *inform* rather than *surveil or rank*. Most of what's worth showing, Herald already extracts; a few high-value additions (PR cycle time, time-to-first-review, revert/fix rate) need modest new fetching.

---

## 1. Why LOC/churn is broken — and why agentic coding breaks it further

### 1.1 LOC was already a bad proxy
The critique is decades old (Dijkstra's quip that LOC should be counted as "lines spent," not "lines produced"; Bill Gates' apocryphal "measuring programming progress by lines of code is like measuring aircraft building progress by weight"). The durable objections:

- **Volume ≠ value.** The most valuable change of a week can be a one-line fix to a race condition or a config flag that unblocks a launch. The least valuable can be 2,000 lines of boilerplate.
- **Refactors and deletions are undervalued or *punished*.** Deleting 500 lines of dead code is real, positive engineering, but shows as negative or trivial churn. "Net lines" actively disincentivizes cleanup.
- **Generated-code inflation.** Lockfiles, codegen, schema dumps, vendored deps, and snapshots produce huge diffs with ~zero human effort. (Herald already mitigates this — see `src/filter.ts` / `sumRealChurn`.)
- **Gameability + Goodhart.** The moment LOC is a target, it stops being a measure: people split commits, avoid deletions, pad changes.

### 1.2 Agentic coding makes all of this *worse*
In 2025–2026, AI agents (Claude Code, Copilot agents, Cursor, Codex-style tools) author a large and growing share of committed code. That changes the cost structure of a diff:

- **Large diffs are now cheap.** A human can prompt a 1,500-line scaffold in minutes. LOC-per-day, commits-per-day, and "+/- lines" inflate without tracking effort or judgment. The *marginal cost of code* fell; the marginal cost of *good decisions, review, and integration* did not.
- **Volume decouples further from value.** When generation is cheap, the scarce, valuable human contributions move *upstream* (problem framing, decomposition, interface design) and *downstream* (review, verification, integration, debugging). None of these show up as authored lines.
- **Generated-code inflation, intensified.** AI tends to produce verbose, well-commented, defensively-structured code, and to regenerate large blocks. Raw additions balloon.
- **Rework risk rises.** AI-authored diffs can be plausible-but-wrong, so a higher share may be reverted, rewritten, or hot-fixed shortly after merge. This makes *rework/stability* signals **more** informative than gross output — the opposite of LOC.
- **Attribution blurs.** "Who wrote this?" is now "who prompted, curated, and approved this?" Per-person authorship counts mean even less than before.

**Takeaway for Herald:** treat raw LOC as *flavor/context, never a score*. Lean on **flow** (does work move smoothly from idea → reviewed → merged → shipped?) and **stability** (does it stay merged, or bounce back as reverts/fixes?). Both are robust to "the agent wrote it."

---

## 2. Established frameworks and what they actually recommend

### 2.1 DORA — the Four Keys
From the DevOps Research and Assessment program (Nicole Forsgren, Jez Humble, Gene Kim; popularized in *Accelerate*, 2018, and the annual *State of DevOps / DORA* reports). The **four key metrics** of software delivery performance:

1. **Deployment Frequency** — how often you ship to production.
2. **Lead Time for Changes** — commit → production duration.
3. **Change Failure Rate** — % of deployments causing a failure/incident.
4. **Failed Deployment Recovery Time** (formerly MTTR) — how fast you recover.

DORA later added a **fifth, reliability/operational-performance** key. The framing pairs **throughput** (1, 2) with **stability** (3, 4) — explicitly so teams can't win one by sacrificing the other. **DORA is a *system/team*-level measure of delivery capability — not an individual scorecard.** Several keys (deployment frequency, CFR, recovery time) need *deployment/incident* data Herald does not have from GitHub activity alone; **lead-time-like** signals are partly approximable from PR/commit timestamps.

### 2.2 SPACE — five dimensions
The SPACE framework (Forsgren, Margaret-Anne Storey, Chandra Maddila, Tom Zimmermann, Brian Houck, Jenna Butler; ~2021, an ACM Queue / Microsoft-GitHub Research paper — *from memory, verify*) was a direct rebuttal to one-dimensional productivity metrics. Its thesis: **productivity is multidimensional; never measure it with a single metric, and combine perceptual (survey) with system data.** The five dimensions:

- **S — Satisfaction & well-being** (how fulfilled/healthy developers are).
- **P — Performance** (outcomes: quality, reliability — not raw output).
- **A — Activity** (counts of actions: commits, PRs, reviews). *Activity is just one of five — and the one most prone to misuse.*
- **C — Communication & collaboration** (review participation, knowledge sharing, discoverability).
- **E — Efficiency & flow** (ability to make progress with minimal interruption/handoff delay).

**Key SPACE prescriptions Herald should honor:**
- Pick metrics from **multiple** dimensions; never report Activity alone.
- Prefer **team-level**; warn explicitly against individual metrics.
- Some dimensions (Satisfaction, much of Performance) are *not* derivable from GitHub — be honest about the blind spot.

### 2.3 DX Core 4 — the practitioner consolidation
DX Core 4 (from DX / Abi Noda, with Nicole Forsgren involved; ~2024–2025 — *from memory, verify*) unifies DORA, SPACE, and the DevEx research into **four top-level dimensions** meant to be measured together:

1. **Speed** (e.g., diffs/PRs per engineer, lead time, deployment frequency) — *throughput/flow*.
2. **Effectiveness** (developer-experience: ease of getting work done, low friction — often survey-based).
3. **Quality** (change failure rate, defect/rework rate, operational health).
4. **Impact** (business outcomes, % of time on new value vs. toil/maintenance).

DX Core 4 also explicitly engages the **AI era** — DX has published on measuring AI-assisted development, AI adoption, and time saved (*from memory, verify*). Its stance mirrors the consensus: **balance speed with quality and impact; don't let an AI-driven throughput bump hide a quality/rework regression.**

### 2.4 The Forsgren/Orosz vs. McKinsey debate
In **2023**, McKinsey published a piece proposing ways to measure individual *developer productivity* (introducing constructs like "inner/outer loop" time and contribution metrics). **Kent Beck and Gergely Orosz** co-wrote a widely-read rebuttal in *The Pragmatic Engineer* (2023, *from memory, verify*) arguing it risked resurrecting discredited individual-output measurement and Goodhart traps. **Nicole Forsgren and the DORA/SPACE camp** likewise pushed back, reiterating: measure **team/system outcomes**, combine system + perceptual data, and **don't rank individuals**. This debate is the strongest available warrant for Herald's framing choices in §6.

### 2.5 Goodhart's law and the danger of individual dev metrics
> **Goodhart's law:** "When a measure becomes a target, it ceases to be a good measure."

Every vendor and researcher in this space (DORA, SPACE, DX, GitHub, Swarmia, LinearB, Faros) converges on the same guardrails:
- **No individual leaderboards / stack-ranking** from activity data.
- **Metrics inform conversations; they don't grade people.**
- **Balanced sets** (throughput *with* quality) resist gaming better than single numbers.
- **Surveillance erodes trust**, which is itself a top driver of real productivity (DevEx research).

This is doubly important for Herald because it **posts publicly to a team Discord** — see §6.

---

## 3. What's proposed for the agentic era specifically

The frameworks above predate ubiquitous coding agents but extend cleanly. The 2024–2026 discourse (much of it from GitHub, DX, Faros AI, LinearB, Swarmia, and individual thinkers — *attributions from memory, verify*) adds:

- **Outcome/throughput over output.** Measure *work delivered and its stability*, not lines/commits authored. **PR throughput** (PRs merged) and **cycle time** are favored over LOC. (Echoed across DX Core 4 "Speed" and DORA lead time.)
- **PR cycle time decomposition.** Break the PR lifecycle into **coding → pickup (open → first review) → review → merge**, then **deploy**. LinearB and Swarmia popularized this decomposition; it localizes *where flow stalls*. When agents make coding faster, the bottleneck often **shifts to review** — making **time-to-first-review / review latency** the metric that matters most.
- **Review latency & review load.** As AI raises PR volume, *human review becomes the constraint*. Time-to-first-review and reviews-given distribution surface review bottlenecks and unequal review burden.
- **Rework / revert / change-failure rate.** Reverts, hot-fixes, and "churn-of-churn" (code rewritten shortly after merge) are emphasized as the **quality counterweight** to any AI throughput gain. GitHub's earlier Copilot studies and later AI-impact work lean on *acceptance and retention of suggestions* and *downstream rework* (*from memory, verify*).
- **AI-assisted tagging / measuring AI's contribution.** DX and others propose explicitly *tagging* AI-assisted PRs/commits (e.g., via labels, trailers, or tool telemetry) so teams can compare AI-assisted vs. not on **quality and rework**, and estimate **time saved** — rather than naively crediting AI with more lines. The honest version measures *whether AI-assisted work is as stable*, not *how much more code it produced*.
- **"% time in flow" / focus.** DevEx research (Noda, Forsgren, Storey; *from memory, verify*) elevates **uninterrupted flow** and **low friction** as core. Hard to derive from GitHub alone (needs surveys/IDE telemetry), but *PR pickup latency* and *batch size* are partial proxies.
- **Batch size / small PRs.** Smaller PRs review faster, fail less, and flow better. As agents make it easy to generate huge diffs, **keeping PRs small** is an increasingly recommended discipline — and **PR size distribution** is a measurable proxy.

### Voices on AI-assisted development (from memory, verify)
- **Kent Beck** — broadly positive on coding agents ("the value of my skills changed; my taste and judgment matter more"); has framed AI as amplifying experienced engineers. Co-author of the McKinsey rebuttal; strong anti-individual-metric stance.
- **Martin Fowler** (and thoughtworks colleagues) — emphasize that AI raises the importance of **architecture, tests, and review**; warn against trusting plausible-looking AI output; stress that **tests and refactoring** are the safety net for agentic code.
- **Simon Willison** — pragmatic documentarian of agentic coding workflows; stresses verification and that the human is accountable for what the agent commits.
- **Gergely Orosz / Pragmatic Engineer** — recurring coverage of "AI didn't replace engineers; it shifted the work to review/integration/judgment," reinforcing *flow + quality* over *output*.

**Net for Herald:** the agentic-era additions point squarely at **cycle time, review latency, rework/revert rate, and small batch size** — all partly derivable from GitHub — plus *optional* AI-assisted tagging if the org adopts a labeling convention.

---

## 4. Code-quality signals derivable from GitHub data ONLY (no static analysis)

No linters, no coverage tools, no AST analysis — only what the events/timestamps/diffs reveal. Each entry: **what it signals**, then **how gameable/noisy** it is.

| Signal | What it signals | Gameable / noisy because… |
|---|---|---|
| **Revert / fix-commit rate** — share of commits/PRs that are reverts ("Revert ...") or whose message matches `fix\|hotfix\|patch` shortly after a merge | Instability; AI-plausible-but-wrong code that bounced back. A *direct* change-failure proxy without deploy data. | Message-convention dependent (teams that don't say "fix" hide it); legit small fixes inflate it; not all fixes are *rework of recent* code. Use a tight time window (fix within N days of the original merge). |
| **Churn-of-churn** — lines in files rewritten/touched again within a short window (e.g. <14–21 days) of being merged | Code that didn't stick; thrashing; unstable design. A classic stability signal (popularized by GitPrime/LinearB as "rework"). | Needs per-file history over time (more fetching + state). Active, healthy iteration on a hot feature looks like rework. Refactors legitimately re-touch recent code. |
| **PR review depth** — review comments per PR; whether a non-author actually reviewed | Real scrutiny vs. rubber-stamping. As AI raises PR volume, *was anything actually reviewed?* | Comment count is gameable (nit-spam) and varies by culture/pairing. "0 comments, approved" may be a trivially-correct PR *or* a rubber stamp — ambiguous. |
| **Time-to-first-review (pickup latency)** — open → first review submitted | Review bottleneck / flow health. Often the #1 stall point post-AI. | Time-zones, weekends, and small teams add noise; a PR can be "reviewed" informally (pairing, Slack) off-platform. Bot/self reviews must be excluded (Herald already excludes self-reviews). |
| **PR size distribution** — additions+deletions (real churn) per PR; % of PRs over a size threshold | Batch size discipline; big AI-generated diffs that are hard to review well | Generated/lockfile lines inflate size unless filtered (Herald *does* filter). "One logical change" varies wildly by repo. Report distribution/median, never a per-person sum. |
| **Unshipped → shipped ratio** — share of commits/effort sitting on non-default branches vs. merged to default | Work-in-progress buildup; integration lag; flow stalls before merge | Long-lived shared branches (`staging`) and trunk-based vs. branch-heavy workflows skew it. Herald defines `unshipped` = *not on default branch*, so shared branches count as unshipped (documented tradeoff). |
| **Test-file touch ratio** — % of changed files matching test globs (`**/*.test.*`, `**/*_test.*`, `**/test_*.py`, `**/spec/**`, `__tests__/**`) | Whether new code arrives with tests — a *cheap* quality proxy, more important for agentic code (Fowler's "tests are the safety net") | Touching a test file ≠ good test; teams/languages vary; trivial test edits count. Snapshot tests (already noise-filtered) shouldn't count. Directional only. |
| **Bug-labeled issue rate** — issues labeled `bug`/`regression` opened vs. closed in-window | Defect inflow/outflow; quality trend | Label hygiene varies enormously; many orgs don't triage; closing ≠ fixing. Only meaningful where labeling is disciplined. |
| **Approval-to-merge gap / merged-without-review rate** | Process health; risky merges that skipped review | Solo maintainers and OSS legitimately self-merge; admin merges; not inherently bad. |

**Cross-cutting caution:** every one of these is **directional and team-level**. None should grade an individual. They earn their keep as *trend lines and conversation starters*, especially the **revert/fix rate** and **time-to-first-review** pair (a clean throughput↔stability counterweight, mirroring DORA's design).

---

## 5. Concrete recommendation table for Herald

Prioritized (~most-recommended first). **"Computable today"** is judged against Herald's current extraction in `src/types.ts` / `collect.ts` / `github.ts`:

- *yes* = derivable now from data Herald already has in the `PersonActivity` / `OrgActivity` / `*Activity` models.
- *partial* = some pieces exist; needs a small computation or one extra field already fetchable from current API calls.
- *needs new fetch* = requires GitHub API calls Herald doesn't make yet (or per-item history/state Herald doesn't persist).

| # | Metric | What it signals | Computable from GitHub API today? | Individual-safe or team-only | Gameability / caveats |
|---|---|---|---|---|---|
| 1 | **PRs merged (throughput)** | Delivered work units — the LOC replacement | **yes** — `totals.prsMerged`, org rollup in `computeOrgTotals` | **team-only** (per-person OK as context, not a score) | Splitting PRs inflates; count is robust-ish but never rank people by it |
| 2 | **Reviews given (collaboration)** | Review participation; who's carrying review load | **yes** — `totals.reviewsGiven`, `ReviewActivity.state` | **team-only** | Rubber-stamp approvals count; uneven load is a *staffing* insight, not a grade |
| 3 | **Unshipped → shipped ratio (WIP / flow)** | Work piling up on feature branches vs. merged to default | **yes** — `CommitActivity.unshipped`, `totals.unshippedCommits` vs. shipped | **team-only** | Branch-heavy workflows & shared `staging` skew it; report as a ratio/trend |
| 4 | **Real churn (+/−, noise-filtered)** | Rough size/shape of change — **context, not a score** | **yes** — `totals.additions/deletions` via `sumRealChurn` (already excludes generated/lockfiles) | **team-only** (show as net/aggregate) | The classic LOC trap — present as flavor; **never** per-person ranking; deletions are *good* |
| 5 | **Revert / fix-commit rate (stability)** | Rework; AI-plausible-but-wrong code bouncing back — the quality counterweight | **partial** — commit messages are fetched (`CommitActivity.message`, first line); need a regex pass (`^revert\b`, `fix/hotfix`) + ideally link to a recent merge | **team-only** | Convention-dependent; tight time window; the single most valuable *new* quality signal |
| 6 | **PR size distribution (batch size)** | Small-batch discipline; reviewable diffs vs. huge AI dumps | **partial** — `PullRequestActivity.additions/deletions` exist (but PR line counts are **raw**, not noise-filtered like commits are) | **team-only** | Report median/%-over-threshold, not a sum; filter generated paths for parity with commits |
| 7 | **Time-to-first-review (pickup latency)** | Review bottleneck — *the* metric when agents speed up coding | **needs new fetch** — Herald has PR `createdAt` and review `submittedAt`, but only fetches reviews for PRs *active in-window*; computing pickup reliably needs the PR's open time + first review time paired (the data is reachable; the pairing/derivation isn't done) | **team-only** | TZ/weekend noise; off-platform review invisible; exclude self/bot reviews (self already excluded) |
| 8 | **PR cycle time (open → merged)** | End-to-end flow; lead-time proxy (DORA-adjacent) | **partial** — `createdAt` + `mergedAt` on `PullRequestActivity`; just a subtraction, but only for PRs merged in-window | **team-only** | Doesn't include deploy; long-lived PRs skew mean — use median |
| 9 | **Test-file touch ratio** | New code arriving with tests — cheap quality proxy | **needs new fetch** — Herald sees per-file paths *inside* `fetchCommits` (to compute churn) but **discards filenames**; would need to retain a "touched test file?" flag | **team-only** | Touching ≠ testing well; language/glob-dependent; directional only |
| 10 | **Bug-labeled issue in/out rate** | Defect inflow vs. outflow trend | **needs new fetch** — `IssueActivity` has no labels; `fetchIssues` doesn't request/keep `labels` | **team-only** | Label hygiene varies; many orgs don't triage; opt-in where labeling is disciplined |
| 11 | **Issues opened/closed (work intake/closeout)** | Planning/closeout activity around the code | **yes** — `totals.issuesOpened/issuesClosed` | **team-only** | Closing ≠ resolving; noisy as a quality signal, fine as context |
| 12 | **Repos touched (breadth)** | Cross-cutting work; coordination surface | **yes** — `totals.repos`, distinct-repo set in `computeOrgTotals` | **team-only** | Breadth ≠ value; pure context |

**Reading the table:** items **1–4 and 11–12 are free today** (Herald already computes them — they live in `PersonActivity.totals` and `computeOrgTotals`). The **high-value upgrades** are **#5 (revert/fix rate)** and **#7 (time-to-first-review)** — the throughput↔stability and flow signals the agentic era most rewards. #5 is nearly free (a regex over `CommitActivity.message`, which Herald already has); #7/#9/#10 need genuine new fetching or retaining data Herald currently discards (PR-open↔first-review pairing; per-file test-glob flag; issue labels).

---

## 6. Framing guidance — inform, don't surveil

Herald **posts publicly to a team Discord**. That makes framing a product-defining constraint, not a footnote. The project plan already flags this (§8: "team-visibility aid, not a performance ranker"). Concretely:

1. **Team-level by default.** The stats block reports **org/team aggregates and trends**. Per-person numbers belong in the *narrative* ("Shipped #123…"), not in a *scoreboard*.
2. **No leaderboards, no ranking, no "top contributor."** Herald's internal `activityRank` is a *display sort* for the narrative — never expose it as a score. Do not render "most commits," "most lines," or any ordering presented as merit.
3. **Lead with flow & stability, not output.** Headline PRs merged, cycle time, review latency, and revert rate — *not* lines. If lines appear, label them plainly as change *size/context*, with deletions framed as positive.
4. **Honest caveats, inline.** Herald only sees GitHub. It does **not** see design, pairing, planning, calls, docs, mentoring, or AI-prompting effort (project plan §8 "attribution blind spots"). Say so: a short footer like *"GitHub activity only — not a measure of everyone's contribution."*
5. **Trends over point-in-time.** A single day's counts are noisy and invite comparison. Week-over-week direction ("review latency down vs. last week") is both more useful and less personal.
6. **Opt-in, and easy to turn off.** The stats block is **optional** (per the brief). Default to a conservative, team-level subset; gate anything individual-tinged or quality-judging (revert rate per person, test ratios) behind explicit opt-in.
7. **Frame as a mirror, not a verdict.** Stats start conversations ("review queue is backing up"), they don't end them with a grade.

This directly applies the DORA/SPACE/DX consensus and the Beck–Orosz–Forsgren anti-individual-metric stance from §2.

---

## 7. If I were building Herald's stats block

Opinionated final pick. **Everything team-level. No per-person numbers in the stats block.**

### Default — **Daily** (compact, 3–5 lines under the narrative)
Cheap, already-computed, low-drama context — output *and* a flow signal, no quality judgments:

- **PRs merged** + **PRs opened** today *(yes — `totals`/`computeOrgTotals`)*
- **Commits** with **unshipped count** ("12 commits, 4 unshipped on feature branches") *(yes)*
- **Reviews given** today *(yes)*
- **Net change** "+1.2k / −400 (noise-filtered)" — labeled as *size, not score*, deletions shown as a good thing *(yes — `sumRealChurn`)*
- **Repos touched** *(yes)*

That's it for daily. All free from current extraction. No latency math (too noisy day-to-day), no quality flags (too personal/noisy at one-day resolution).

### Default — **Weekly** (the richer, trend-oriented block)
Weekly is where flow/quality signals belong — bigger sample, less noise, less personal:

- **PRs merged this week** + **week-over-week trend** *(yes, with a little history)*
- **Median PR cycle time** (open → merged) *(partial — `createdAt`/`mergedAt` subtraction)*
- **Median time-to-first-review** + a gentle "review queue backing up?" note *(needs new fetch — worth building; it's the agentic-era flow signal)*
- **Revert / fix-commit rate** as a **team trend** *(partial — regex over `CommitActivity.message`; cheap, high value)*
- **PR size distribution** — median + % of PRs over a "large" threshold *(partial — filter PR churn for parity)*
- **Unshipped → shipped ratio** — is WIP piling up? *(yes)*

### Behind an explicit **opt-in** (off by default)
Higher surveillance/judgment risk, or shakier data:

- **Test-file touch ratio** *(needs new fetch; directional only)*
- **Bug-labeled issue in/out rate** *(needs new fetch; needs label discipline)*
- **AI-assisted tagging breakdown** — only if the org adopts a labeling/trailer convention; compare AI-assisted vs. not on *stability*, never to credit AI with *volume*
- **Per-person stat lines** — if a team genuinely wants them, gate hard, and still never rank

### Avoid entirely
- **Per-person LOC / commits-per-day leaderboards** — the canonical Goodhart trap; doubly wrong in the agentic era.
- **"Top contributor" / any merit ordering.**
- **Raw (unfiltered) LOC as a headline number** — meaningless once agents write the diffs.
- **Single-number "productivity scores"** — the exact anti-pattern SPACE was written to kill.
- **Daily individual quality flags** (per-person revert/test rates at one-day resolution) — noisy and punitive in a public channel.

### Build order (effort vs. value)
1. **Free now** (ship first): daily block + weekly PRs-merged/unshipped/reviews/net-change — all from `totals`/`computeOrgTotals`.
2. **Cheap, high value**: **revert/fix-commit rate** (regex over `CommitActivity.message`) and **PR cycle time** (`mergedAt − createdAt`). Tiny code, big informational payoff.
3. **Worth the new fetch**: **time-to-first-review** — pair PR open time with first non-self review `submittedAt`. The signal the agentic shift most rewards (review is the new bottleneck).
4. **Opt-in extras** later: test-touch ratio (retain a test-glob flag where Herald already iterates per-file in `fetchCommits`) and issue-label rates (add `labels` to `fetchIssues`/`IssueActivity`).

---

## Appendix — citations status

All framework descriptions (DORA four/five keys, SPACE five dimensions, DX Core 4 four dimensions, Goodhart's law) are well-established and stated confidently. The following are **recalled from memory — verify before external citation**: the SPACE author list and venue/year; the DX Core 4 authorship and 2024–2025 timing; the 2023 McKinsey developer-productivity article and the Beck/Orosz *Pragmatic Engineer* rebuttal; specific positions attributed to Beck, Fowler, Willison, and Orosz on AI-assisted development; GitHub/DX/Faros/LinearB/Swarmia specific publications. No URLs were fabricated.
