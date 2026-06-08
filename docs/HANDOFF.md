---
created: 2026-06-03
status: active
author: Claude main session
session: aa8bf74f-adef-4f15-a54b-4d2aa9d20e9e
branch: main
informed_by: The full build + ship of Inky's MVP (Phases 0–5), its Render deployment, and the roadmap in roadmap-and-phase-6.md
notes: Resume/handoff context — a self-contained snapshot for picking the project back up (including pasting into a fresh AI session). Keep §10 of the project plan and this file in sync after major changes.
---

# Handoff — resuming work on Inky 🐙

A self-contained snapshot so anyone (or a fresh AI session) can pick Inky up fast.
Re-read the docs linked under **Ground truth** before making changes.

## What Inky is
A TypeScript/pnpm Discord bot that reads an organization's GitHub activity (commits
across all branches, PRs, reviews, issues) and **writes the team's daily/weekly
standup automatically — zero human input.** Open-core: free BYO-key self-host now,
a paid hosted tier later.

## Current state — LIVE
- **Public OSS** (MIT) at `github.com/Doppel-Labs/inky`, on `main`, everything pushed.
- **Hosted & autonomous:** a Render Background Worker posts a **daily (9am PT, weekdays)**
  and **weekly (8am PT, Mon)** standup on its own, plus a working **`/standup`** slash
  command (bot `Inky#0459`).
- **Health:** 111 tests passing, typecheck clean. Phases 0–5 complete + polish.

## Ground truth (re-read first; prefer over memory)
- `docs/planning/inky-project-plan.md` — §9 decisions log, §10 current status.
- `docs/planning/roadmap-and-phase-6.md` — next steps (3 tracks) + Phase 6 design.
- `docs/planning/loc-accuracy-cleaning.md` — **DONE** (committed on `feat/loc-merge-cap-cleaning`):
  per-commit LOC cap (`maxCommitLines`, default 300k) + merge-commit exclusion (`isMerge`), via a
  pure `cleanCommitChurn` helper in `github.ts`. LOC-only; commit/day counts unchanged.
- `docs/deployment.md`, `docs/discord-bot-setup.md`, `docs/github-token-setup.md`.
- `docs/reviews/phase4-review.md`, `docs/research/agentic-coding-metrics.md`.

## Architecture
Host-agnostic core pipeline, thin trigger/delivery adapters:
```
trigger (cron worker | /standup) → collect() → [reconcile()] → summarize() → render() → delivery (webhook | bot)
```
Key `packages/core/src/` files: `collect.ts`, `github.ts`, `summarize.ts` (one LLM call over a
factual digest; model is *forced* to call an `emit_standup` tool → grounded,
structured), `render.ts`, `reconcile.ts` (status-vs-roadmap from GitHub milestones),
`standup.ts` (`buildStandup()` seam shared by CLI + worker), `worker.ts` (croner;
`schedule.jobs[]` = daily + weekly), `bot.ts` (discord.js gateway), `commands.ts`
(`/standup` handler behind a transport-agnostic `StandupInteraction`), `discord.ts`
(webhook + embeds), `config.ts`, `cli.ts`, `window.ts`. LLM is provider-agnostic
(default `claude-sonnet-4-6`); dependency injection everywhere for no-network tests.

## Dev
```
GITHUB_TOKEN=$(gh auth token) pnpm --silent dev <collect|standup|serve|register-commands> [flags]
pnpm test        # node --test, all injected fakes, no network
pnpm typecheck
```
The local `inky.config.json` is **gitignored** (holds the real org + aliases — never
commit it; the committed example is `inky.config.example.json`). Secrets come only
from env / `.env` (gitignored): `GITHUB_TOKEN`, an LLM key, `DISCORD_WEBHOOK_URL`,
`DISCORD_BOT_TOKEN`.

## Conventions
- **No real org/contributor names** in committed artifacts (OSS) — use
  `your-org`/`alice`/`bob`/`carol`. Real values live only in gitignored files.
- **Explicit `git add <paths>`**, never `-A`. Commit per milestone.
- Before staging, sweep stray cloud-sync conflict copies:
  `find . -name '* 2.*' -not -path './node_modules/*'` and delete them.

## Next (see `roadmap-and-phase-6.md`)
- **A — Adoption (do first):** README hero + demo GIF, GitHub Actions CI,
  `CONTRIBUTING.md`, then distribute (awesome-lists / r/selfhosted / PH).
- **B — Feature depth:** `reconcile()` → a config/`ROADMAP.md`-declared roadmap (for
  teams without milestones), week-over-week trend stats, Slack delivery.
- **C — Phase 6 (the business):** hosted multi-tenant SaaS — GitHub App → Postgres →
  Next.js dashboard → Stripe billing. (Same build that unlocks user-editable settings.)
- **Recommended order:** adoption polish + the GitHub App first (helps self-host *and*
  de-risks Phase 6); start the SaaS when there's demand.
