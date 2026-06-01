---
created: 2026-05-30
status: active
author: Claude main session
session: herald-spec-planning
branch: main
informed_by: User brief (daily automated standup from GitHub → Discord); prior art review (Geekbot/DailyBot/Standuply, GitHub webhooks, LinearB/Swarmia/Haystack); reuse analysis of a prior retrospective performance auditor (team_perf.py)
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

## 9. Decisions log (build)

Design decisions made during implementation, captured so they survive context compaction. Most are also reflected in code comments.

- **Stack:** TypeScript/Node, pnpm (pinned via `packageManager` + corepack), strict TS (NodeNext). Picked pnpm over npm for monorepo-readiness (future Next.js dashboard), strictness, speed.
- **Data source:** GitHub **API** (Octokit REST), not local git-log — must work on un-cloned org repos for the hosted tier.
- **Commits across ALL branches:** `fetchCommits` traverses every branch (not just default), dedupes by SHA, and flags commits not on the default branch as **`unshipped`** — so work-in-progress is visible. Decision: "unshipped" = *not on default branch* (so shared branches like `staging` count as unshipped), NOT per-person feature branches. Accepted tradeoff.
- **All org repos:** `config.repos: []` means all non-archived repos in the org (via `listOrgRepos`). Tests scope to a couple of named repos.
- **Render is commit-centric & mechanical (no AI yet):** shipped feature PRs → commit work (unshipped first, with branch) → reviews. Doubles as the no-API-key fallback and the ground truth for the Phase 3 summarizer.
- **Noise filtering — bots:** `excludeBots` (default true) drops `[bot]`-suffixed logins. Surfaced live when `chatgpt-codex-connector[bot]` appeared.
- **Noise filtering — LOC:** `src/filter.ts` (picomatch) excludes lockfiles/generated/venv/build/cache paths from line counts only (never commit/PR counts). Broadened to cover TS (Next/Vite/etc.) + Python (venv/uv/caches) + other ecosystems. `extraNoisePatterns` config extends defaults per-repo. **Migrations are kept** (real work). Live audit: 0 false positives over 301 real files.
- **Promotion PRs filtered:** `isPromotionPR` drops "Staging" / "Promote:" / "Merge X into Y" / env-name PRs from highlights (kept in counts).
- **Window-aware title:** `windowLabel` derives heading from window length (Daily / Weekly / N-Day / "last Nh"); not hardcoded "Daily".
- **Adjustable windows:** `collect()` takes a `windowHours` override; CLI `--days`/`--hours`. Groundwork for Phase 4 queryable slash commands (e.g. `/standup last 3 days`).
- **Line counts kept** in output for now (user OK with the mild eval-y framing). Revisit if framing becomes a concern.
- **Secrets:** only from env (`GITHUB_TOKEN`/`GH_TOKEN`, and one LLM key — `ANTHROPIC_API_KEY`/`GROQ_API_KEY`/`OPENAI_API_KEY`); `herald.config.json` is gitignored; token never leaves the machine. Least-privilege fine-grained PAT documented in `docs/github-token-setup.md`.
- **summarize() is grounded + structured (Phase 3):** one model call over a factual digest (built from the same activity `renderMechanical` shows); the model is *forced* to call an `emit_standup` tool, so output is structured (maps by login), never free-form-parsed. Missing people fall back to factual stat lines. System prompt forbids invention. `renderStandup()` turns the `Standup` into Discord markdown.
- **LLM call is injected, provider-agnostic:** `summarize()` depends on a narrow `MessagesCreate` interface (mirrors `anthropic.messages.create`), so it's unit-tested with a fake — like the Discord layer. `resolveLlm(config, secrets)` picks the adapter from `config.provider`: **anthropic** (default, `anthropic.ts`, best grounded quality) or **groq**/**openai** (`openai-compat.ts`, one fetch-based OpenAI-compatible adapter; `baseUrl` override covers OpenRouter/Ollama). Decision (user, 2026-05-30): keep Claude default for quality, add Groq behind the same seam rather than switching — fits open-core BYO-key. Prompt caching kept but noted to mostly help the burst/slash-command case, not once-daily calls (5-min TTL).
- **Discord delivery:** posts as **embeds** (so masked PR links render), chunked 4096/embed, 10 embeds/message, 429 backoff. **Not yet tested against a real webhook** — user deferred; unit-tested with injected fetch + `--dry-run`.
- **Git hygiene:** explicit `git add <paths>` (no `-A`), no Claude co-author lines. Commit per milestone.
- **Model defaults (live A/B'd):** anthropic default = **`claude-sonnet-4-6`** (Haiku occasionally mislabeled org aggregates even with verified totals; Sonnet got them right and is richer; Opus was overkill). groq default = **`openai/gpt-oss-120b`** (far better than Llama 3.3 70b; competitive with Claude). CLI `--provider` / `--model` override for A/B; switching provider drops the configured model so the new provider's default applies.
- **Report depth scales with the window:** `detailForWindow()` tiers daily→multi-day→weekly→monthly→long-range, scaling per-person sentence targets, max highlights, digest commit/PR caps, and the output-token budget. The prompt carries a DEPTH TARGET. Verified: daily ~164 words, weekly ~641, monthly ~1312.
- **Per-person output grouped by repo:** structured output is `work: RepoWork[]` (one entry per repo, robust vs. regex). `renderStandup` shows a `**repo**` subheader only when a person spans >1 repo. Default per-person style = **bullets** (`format: 'bullets'`; `prose` available); project summary stays prose.
- **Stats panel (team-level, research-backed):** `computeTeamStats` → `Standup.teamTotals`; rendered first (numbers before prose). Shows PRs merged/opened, **median PR cycle time** (excl. promotion PRs), **median time-to-first-review** (derived from in-window reviews + PR open times, no new fetch; only when team reviews), commits+unshipped, **revert rate** (true reverts only, not `fix:`), repos, net LOC labeled *size, not score*. `stats: 'auto'` shows it on weekly+ (not daily); `--stats`/`--no-stats` force. Per-person stat line default-on, paired with the panel; `--stats-per-person` forces, `statsPerPerson:false` = team-only. Backed by `docs/research/agentic-coding-metrics.md` (web-grounded: DORA 2024/25, SPACE, DX Core 4, GSM, Netflix/Spotify/Anthropic).
- **OSS hygiene:** committed artifacts (example config, test fixtures, docs) use generic placeholders (`your-org`, `alice`/`bob`) — no real org/contributor identities. Real values live only in gitignored `herald.config.json`/`.env`/`.herald-output/`. (Memory: do not name individuals in committed artifacts.)
- **Phase 4 — worker (`herald serve`):** the "runs on its own" trigger layer is an **in-process scheduler** ([`croner`](https://github.com/hexagon/croner) — zero-dep, IANA-timezone/DST-aware, overlap `protect`), not external cron. Decision (user, 2026-06-01): a **long-running worker** over GitHub Actions — aligns with the future hosted tier (the same always-on process will later host the slash-command gateway). One scheduled tick = the full `collect→summarize→render→post` pipeline, wrapped so a failed run (GitHub/LLM/Discord error) is **logged and the daemon lives on**; `protect` skips a tick rather than overlapping. `schedule: { cron, timezone }` config (default `0 9 * * *` UTC; keep `windowHours` in step with the cadence). `serve --once` runs a single cycle (live first-test / one-shot for those who *do* want external cron); `serve --once --dry-run` builds + prints with no webhook. SIGINT/SIGTERM shut down cleanly. **Single instance only** — each worker posts, so two would double-post.
- **Shared build seam:** the collect→(summarize|mechanical)→render logic was extracted out of `cli.ts` into **`buildStandup()` (`src/standup.ts`)** with injectable `collect`+`resolveLlm`, so the CLI `standup` command and the worker run one identical, unit-tested path (no network in tests).
- **Real Discord post is live:** the webhook URL now resolves **from env first** (`DISCORD_WEBHOOK_URL`) over `config.discord.webhookUrl` via `resolveWebhookUrl` — it's sensitive, so env is its home, keeping it out of committed config and letting a hosted worker inject it. The post path (`postStandupToDiscord`: embeds/chunking/429) was already built + unit-tested; Phase 4 wires it on for both `standup` and `serve`. Verified end-to-end via `serve --once --dry-run` (collect → Sonnet summary → full stats panel, printed). The actual HTTP POST still awaits a real webhook URL the user controls.
- **Deployability:** multi-stage `Dockerfile` (build compiles to `dist/` with the dev toolchain; runtime ships **prod-only deps + compiled JS** — no tsx/esbuild, so the ignored-esbuild-build-script warning never bites), `Procfile` (`worker:`), `.dockerignore`, and `docs/deployment.md` (Railway/Fly/Render/Docker + schedule/secrets/one-instance caveat). Image not built in this env (no Docker daemon); `pnpm build` + `node dist/cli.js serve` verified locally.

### Open feedback the user gave (incorporated)
Show unshipped work ✓ · clean promotion-PR noise ✓ · adjustable time windows ✓ · window-correct titles ✓.

### Still open / deferred
- **`/standup` slash command** — the remaining Phase 4 piece, deferred by the user: needs a registered Discord application + bot token and an interactions transport (gateway vs HTTP). The worker (the autonomous half of Phase 4) ships first.
- Real Discord **HTTP POST** is wired and unit-tested but not yet fired against a live channel (needs a webhook URL the user controls; set `DISCORD_WEBHOOK_URL`).
- User will create the least-privilege GitHub token later.
- Performance: all-branch traversal is ~12s for 2 repos/3 days; could be heavy org-wide (optimize with GraphQL / skip stale branches if needed).

## 10. Current status (as of 2026-06-01)

- **Phases 0–3 complete + the autonomous half of Phase 4** (the worker), all committed on `main`. **70 tests passing, typecheck clean.**
- **Phase 3 (`summarize()`) done and live-verified** with real AI output (Anthropic + Groq keys are set in `.env`). AI-written per-person update grounded in a factual digest, structured via a forced `emit_standup` tool call, work grouped by repo, bullets by default. Provider-agnostic.
- **Phase 4 worker done and live-verified:** `herald serve` runs the standup on `config.schedule` via an in-process croner scheduler; the build seam is shared with the CLI through `buildStandup()`; the real Discord post is wired (env `DISCORD_WEBHOOK_URL` preferred). End-to-end verified with `serve --once --dry-run` (collect → Sonnet → stats panel, printed). Deployable: `Dockerfile`/`Procfile`/`.dockerignore` + `docs/deployment.md`. (See §9 for the full decision set.)
- **Enhancements since Phase 3 (all committed, all in §9):** Sonnet/gpt-oss model defaults + `--provider`/`--model` flags; window→length scaling; repo-grouped bullets; team stats panel (cycle time, time-to-first-review, revert rate, etc.); per-person stats; web-grounded metrics research (`docs/research/agentic-coding-metrics.md`); OSS genericization of committed files.
- **Working commands:** `herald collect`; `herald standup --dry-run [--days N|--hours N] [--provider p] [--model m] [--format prose|bullets] [--stats|--no-stats] [--stats-per-person] [--mechanical]`; `herald serve [--once] [--dry-run]`. Dev run: `GITHUB_TOKEN=$(gh auth token) pnpm --silent dev <cmd> …`. Outputs saved to gitignored `.herald-output/`.
- **Web search:** works in the **main thread only** (subagents are denied network in this env) — run grounded research inline, not via a subagent.
- **Next:** finish Phase 4 with the on-demand **Discord `/standup` slash command** (deferred — needs a Discord app + bot token + interactions transport; queryable windows via the `windowHours` override). To fire the **real webhook post**, the user supplies a `DISCORD_WEBHOOK_URL`. Alternative quick add: PR size distribution stat. A review/cleanup pass is also on the table.

## 11. Original immediate next step (historical)

Begin **Phase 0 → 1**: scaffold the TS project and stand up `collect()` against a real org. *(Done — see §10.)*
