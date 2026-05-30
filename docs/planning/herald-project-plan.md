---
created: 2026-05-30
status: active
author: Claude main session
session: herald-spec-planning
branch: main
informed_by: User brief (daily automated standup from GitHub → Discord); prior art review (Geekbot/DailyBot/Standuply, GitHub webhooks, LinearB/Swarmia/Haystack); reuse analysis of team-perf (team_perf.py — retrospective performance auditor)
notes: Definitive spec + phased build plan for Herald, a zero-input AI daily-standup Discord bot that reads org GitHub activity and writes the standup for the team. Core MVP = Phases 0–4; task-tracker reconciliation and hosted/paid tier are later phases.
---

# Herald — Project Plan

> **Herald** — *your team's daily standup, written for you.*
> A Discord bot that reads an organization's GitHub activity each day and writes a per-person + project-wide standup automatically, with **zero human input**. Evolves into a status tracker that reports where the project stands versus its plan.

## 1. The wedge (why this exists)

Every standup tool on the market makes a human do the work — the bot DMs each person *"what did you do yesterday?"* and they type an answer. The information already exists in GitHub (commits, PRs, issues, reviews). **Herald eliminates the human step**: it reads the activity and writes the standup for you. That single inversion — *derived, not solicited* — is the entire product wedge.

The secondary wedge (Phase 5+, the part teams pay for): reconcile that activity against a task tracker / roadmap and report **"where does the project actually stand vs. the plan."** The standup is the hook; status-vs-roadmap is the value.

## 2. Competitive landscape

| Category | Examples | What they do | The gap Herald fills |
|---|---|---|---|
| Async standup bots | Geekbot, DailyBot, Standuply | DM humans, collect typed answers | **Human-input driven.** Herald derives the update from GitHub — no typing. |
| GitHub → Discord webhooks | Native GitHub/Discord integration | Raw event firehose ("X pushed to main") | **Noisy, unsummarized.** Herald produces a digested, AI-written narrative. |
| Engineering analytics | LinearB, Swarmia, Haystack | Deep Git analysis, DORA metrics, manager dashboards | **Enterprise-priced ($20–40+/dev/mo), heavy, manager-facing.** Herald is lightweight, cheap, team-facing, OSS-first. |

**Verdict:** As of early 2026, the *AI-summarized, zero-input, GitHub-derived daily standup delivered to Discord for small teams / OSS orgs* is genuinely underserved. Incumbents either make humans do the work or charge enterprise prices.

## 3. Business model: open-core, sequenced

1. **Open source first.** Natural fit (devs, GitHub, self-hosted), builds distribution/credibility, and **bring-your-own-LLM-key** means it costs the maintainer nothing to let others run it.
2. **Hosted paid tier later.** Managed cron, managed keys, web dashboard, multi-tenant, billing — for teams who don't want to self-host.
3. **Paid value lives in Phase 5+** (task-tracker reconciliation, status-vs-roadmap, history/trends). The free standup is the funnel.

Realistic as a successful OSS project + modest indie/SaaS revenue. Not inherently venture-scale, but a real business.

## 4. Lineage: what we reuse from `team-perf`

`team-perf` (`tools/team_perf.py`, Python) is the **retrospective** sibling — 30-day windows, LOC totals, PR lifetime, time-to-first-review, manager-facing eval reports. Herald is the **daily-narrative** sibling. Different output and cadence, but the data layer overlaps ~80%. We **port the heuristics, not the code** (Herald is TypeScript; the API-first data source differs — see §6):

- **Identity aliasing** — collapse work/personal emails & multiple machines into one canonical GitHub login (`team_perf_aliases.json` pattern). Non-obvious, essential.
- **Email→login resolution** — when a noreply email doesn't reveal the login, sample a commit SHA via the GitHub API.
- **Noise filtering** — exclude lockfiles / generated / vendored / bulk-import churn; blob-hash dedupe for rebased branches. (More relevant to LOC metrics; lighter-touch for narrative, but the path patterns carry over.)
- **PR aggregation shape** — opened/merged/closed/draft, reviews-given, TTFR, lifetime — a ready-made vocabulary for the narrative and the future status tracker.

## 5. Architecture — host-agnostic core pipeline

Design principle: **the core doesn't know how it's triggered or where it posts.** That keeps "decide hosting later" cheap and makes the paid pivot clean.

```
┌─────────────────────────────────────────────────┐
│  Trigger layer   (cron │ /standup slash command)  │  ← swappable
├─────────────────────────────────────────────────┤
│  CORE PIPELINE  (pure, testable, host-agnostic)   │
│   1. collect()    GitHub API → raw events/author  │
│   2. normalize()  → unified Activity[] model      │
│  [5. reconcile()] → tie Activity to tasks/roadmap │  (Phase 5)
│   3. summarize()  Activity[] → LLM → Standup model │
│   4. render()     Standup → Discord embed/markdown│
├─────────────────────────────────────────────────┤
│  Delivery layer  (Discord webhook │ bot post)     │  ← swappable
└─────────────────────────────────────────────────┘
        ▲
   Config (org/repos, channel, schedule, BYO keys, aliases)
```

The task-tracker step (`reconcile()`) slots between `normalize()` and `summarize()` so it never disturbs the core.

## 6. Key technical decisions

- **Stack: TypeScript / Node.** One language across bot + cron worker + future Next.js dashboard + billing. Best Discord ecosystem (`discord.js`). Cheap, trivial hosting (Railway/Render/Fly/Cloudflare). The AI part is just the Anthropic SDK — Python's ML edge is irrelevant here.
- **Data source: GitHub API (REST/GraphQL via Octokit), not local `git log`.** A hosted product can't assume repos are cloned locally. For a 24h standup window the API is simpler (commits, PRs, issues, reviews endpoints) and avoids managing clones. *(Optional later "deep mode" could use local git-log à la team-perf for richer LOC analysis — but not the default.)*
  - Self-host MVP: a personal access token / fine-grained token.
  - Hosted tier: a **GitHub App** (per-org install, finer permissions, higher rate limits).
- **LLM: Anthropic SDK, bring-your-own-key**, with prompt caching. Model pinned to latest Claude (e.g. `claude-opus-4-8` for quality, `claude-haiku-4-5` for cheap/high-volume summaries — configurable).
- **Config-as-data.** A single `herald.config.*` (org, repos, Discord channel/webhook, schedule, alias map, model, filters) so the same core runs self-hosted or multi-tenant.
- **Everything host-agnostic and pure** in the core so trigger/delivery are thin adapters.

## 7. Phased roadmap

| Phase | Scope | Definition of done |
|---|---|---|
| **0 — Scaffold** | TS project, config schema, core type models (`Activity`, `Standup`), env handling, git | Builds & typechecks; config loads |
| **1 — collect()** | GitHub API fetch: commits, PRs, issues, reviews per author, last 24h; identity aliasing + email→login resolution | Prints structured raw activity for a real org |
| **2 — normalize() + render()** | Unified `Activity[]`; **LOC noise filtering** (lockfiles/generated/vendored, ported from team-perf); deterministic digest rendering — **no AI yet** | Posts a real (if mechanical) standup to a Discord channel with sane line counts |
| **3 — summarize()** | Anthropic SDK, BYO key, prompt caching; per-person + project narrative; tone/format prompt | The actual product: a clean AI-written standup |
| **4 — Trigger + delivery** | Cron (GitHub Actions or worker) + `/standup now` slash command; webhook/bot post adapters | Runs daily on its own; on-demand command works |
| **5 — reconcile()** *(paid hook)* | Tie activity to GitHub Issues/Projects (then Linear/Notion); "status vs plan" section | Standup includes a roadmap-status block |
| **6 — Hosted tier** *(paid)* | Next.js dashboard, multi-tenant, GitHub App install flow, managed keys, billing | Self-serve onboarding + recurring billing |

**MVP = Phases 0–4** — a genuinely useful standalone OSS tool.

## 8. Risks & open questions

- **GitHub API rate limits** at org scale (esp. REST per-commit calls). Mitigate with GraphQL batching + a GitHub App's higher limits. *(team-perf sidesteps this with local git-log — our optional deep mode could too.)*
- **Summary quality / hallucination.** The LLM must summarize, not invent. Ground every claim in concrete activity; prefer extraction over generation; cite PR/commit refs.
- **Attribution blind spots** (inherited from team-perf's "doesn't see" list): design work, calls, planning docs, pairing. The standup should be framed as *"GitHub activity,"* not *"everything this person did,"* to avoid being read as a surveillance/eval tool. **Framing matters for adoption** — Herald is a team-visibility aid, not a performance ranker.
- **Discord formatting limits** (embed length, 2000-char messages) — `render()` must chunk/paginate.
- **Privacy/trust positioning** — especially as it nears the manager-facing analytics that incumbents occupy. Keep it team-facing and transparent.

## 9. Immediate next step

Begin **Phase 0 → 1**: scaffold the TS project and stand up `collect()` against a real org (Doppel-Labs repos are an available test target, with the existing alias map as seed data). Decide hosting only at Phase 4.
