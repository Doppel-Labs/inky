# Inky 🐙

> Your team's daily standup, written for you.

Inky is a Discord bot that reads an organization's GitHub activity each day and
**writes the standup automatically** — per person and project-wide — with zero human
input. No more "what did you do yesterday?" prompts: the information already lives in
your commits, PRs, issues, and reviews. Inky reads it and writes the update.

Later it grows into a status tracker that reports where the project stands versus its
plan, by reconciling activity against a task tracker.

## Status

Early development. See [`docs/planning/inky-project-plan.md`](docs/planning/inky-project-plan.md)
for the full spec, competitive analysis, and roadmap.

| Phase | Scope | State |
|---|---|---|
| 0 | Scaffold: TS project, config schema, core types | ✅ |
| 1 | `collect()` — GitHub API fetch + identity aliasing | ✅ |
| 2 | `normalize()` + `render()` — mechanical digest, LOC filtering, Discord delivery | ✅ |
| 3 | `summarize()` — AI-written standup (BYO key; Anthropic/Groq/OpenAI) | ✅ |
| 4 | Trigger + delivery — scheduled worker (`serve`) + `/standup` slash command | ✅ |
| 5 | `reconcile()` — status vs roadmap (paid hook) | ◐ GitHub milestones; Linear/Notion later |
| 6 | Hosted multi-tenant tier + dashboard (paid) | — |

## Architecture

A host-agnostic core pipeline; trigger and delivery are thin, swappable adapters:

```
trigger (cron │ slash command)
   → collect()    GitHub API → raw events per author
   → normalize()  → unified Activity model
   → [reconcile()]  task tracker (Phase 5)
   → summarize()  → LLM → standup
   → render()     → Discord embed/markdown
delivery (webhook │ bot post)
```

## Quick start (dev)

```bash
corepack enable                            # provides the pinned pnpm version
pnpm install
cp .env.example .env                       # add GITHUB_TOKEN (see token guide below)
cp inky.config.example.json inky.config.json   # set your org/repos
pnpm --silent collect                      # fetch + print org activity as JSON
pnpm --silent standup --dry-run --days 1   # build a standup and print it (no Discord)
pnpm --silent serve --once --dry-run       # run one worker cycle and print it
```

To actually post, set `DISCORD_WEBHOOK_URL` (in `.env`) and drop `--dry-run`.

**Need a GitHub token?** See [`docs/github-token-setup.md`](docs/github-token-setup.md)
for a secure, least-privilege (read-only) setup.

> Use `pnpm --silent` so only the JSON reaches stdout (without it, pnpm prints a
> script banner). The installed `inky` binary needs no such flag.

## Commands

Run **`inky help`** for the full reference. There are four commands:

| Command | What it does |
|---|---|
| `inky collect` | Fetch + normalize org activity, print as JSON (debugging). |
| `inky standup` | Build the standup once and post it (or print with `--dry-run`). |
| `inky serve` | Run forever: scheduled posts **+** the `/standup` bot. |
| `inky register-commands` | Register the `/standup` slash command (run once). |

- **Window** (default = config `windowHours`, ending now): `--days N` · `--hours N` · `--since <ISO>` · `--until <ISO>`. Pair `--since`/`--until` for an exact past window, e.g. `--since 2026-06-01 --until 2026-06-02`.
- **Report**: `--stats` / `--no-stats` · `--stats-per-person` · `--roadmap` / `--no-roadmap` · `--format prose|bullets` · `--mechanical` (skip the AI).
- **Other**: `--config <path>` · `--provider <p>` · `--model <id>` · `--dry-run` · `--once` (serve: one cycle then exit).

### Common recipes

```bash
inky standup --dry-run                              # preview today (nothing posted)
inky standup --days 1                               # post a daily standup
inky standup --days 7 --stats                       # weekly, with the team stats panel
inky standup --since 2026-06-01 --until 2026-06-02  # replay an exact past window
inky serve                                          # run on a schedule, forever
inky serve --once --dry-run                         # test one scheduled cycle, printed
```

(In dev, swap `inky` for `pnpm --silent dev` — e.g. `pnpm --silent dev standup --dry-run`.)

## Configuration

- **`inky.config.json`** — non-secret config: org, repos, window, identity
  aliases, Discord target, LLM provider/model. Copy from `inky.config.example.json`.
- **Which repos** — `repos: []` scans every non-archived repo in the org; or list
  specific ones (`["api", "web"]`). With `repos: []`, **`staleDays`** skips repos
  with no recent push so long-dead repos aren't queried (the run logs which):
  - **`"auto"`** (recommended) — skips repos with no push since *that run's* window
    started, so the daily skips >24h-quiet repos and the weekly >7d-quiet, each
    correct by construction. No number to tune.
  - a **number `N`** — fixed: skip repos with no push in N days (must be ≥ your
    longest scheduled window).
  - **`0`** — scan everything.

  Based on last push, so a repo with only issue/review activity in the window is
  skipped too.
- **`.env`** — secrets only (`GITHUB_TOKEN`, an LLM key, `DISCORD_WEBHOOK_URL`). Never committed.
- **GitHub token** — a **read-only** fine-grained PAT scoped to your org + the repos you want, with permissions **Contents · Metadata · Pull requests · Issues** (all *Read*). It can't push, change settings, or touch other orgs. Full walkthrough — incl. the classic-token fallback and where to store it when you deploy — in [`docs/github-token-setup.md`](docs/github-token-setup.md).

### LLM provider (the AI summary)

The summary writer is provider-agnostic — one swappable call seam. Pick a
`provider` in config and set the matching key in `.env`; only one key is needed,
and with none, Inky falls back to the deterministic mechanical render.

| `provider` | Key (env) | Default model | Notes |
|---|---|---|---|
| `anthropic` (default) | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | Best grounding (faithful aggregates) + richest standup. Drop to `claude-haiku-4-5` to cut cost. |
| `groq` | `GROQ_API_KEY` | `openai/gpt-oss-120b` | Fast, cheap, open-weight; grounds well. |
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` | OpenAI, or any OpenAI-compatible endpoint via `baseUrl` (OpenRouter, local Ollama). |

`model` (config) or `--model <id>` overrides the default; `baseUrl` overrides the
endpoint (OpenAI-compatible providers only). The summary is constrained extraction
over a pre-built digest, so a small model holds up — defaults favor cost. Run
`inky standup --mechanical` to skip the AI entirely.

### Report depth & stats

- **Depth scales with the window.** A daily standup is a terse pulse; weekly and
  monthly reviews get proportionally more detail (more sentences, more highlights).
- **Stats lead the report.** A team stats panel renders first (numbers before
  prose). `stats: "auto"` (default) shows it on weekly+ windows but not the daily
  pulse; `"on"`/`"off"` force it. Override per run with `--stats` / `--no-stats`.
  LOC is labeled *size, not score* — see [`docs/research/agentic-coding-metrics.md`](docs/research/agentic-coding-metrics.md).
- **Per-person stats** (`statsPerPerson: true`, default) add a stat line under each
  name, paired with the team panel (shown where it shows). `--stats-per-person`
  forces them on even on the daily; set `false` to keep the post team-level only.
- **Output style.** `format: "bullets"` (default) gives scannable bullet points per
  person; `format: "prose"` (or `--format prose`) gives a narrative paragraph. The
  project summary stays prose either way.

### Status vs plan (roadmap)

Inky can tie the window's activity to your **roadmap** and add a **📍 Status vs
plan** block — what advanced, what's stalled, what's at risk. The MVP reads
**GitHub Milestones** (no extra setup or auth — the milestone's open/closed counts
and due date give progress and "on track" for free):

```jsonc
"roadmap": {
  "enabled": true,
  "source": "github-milestones",
  "milestoneFilter": "",   // optional: only track milestones whose title contains this
  "atRiskDays": 7          // flag a milestone at-risk when due within N days (or past)
}
```

Off by default; enable in config or force per run with `--roadmap` / `--no-roadmap`.
Each tracked milestone shows progress, movement (advanced / stalled / completed /
…), and an ⚠️ at-risk note from its due date — all computed mechanically, with a
short grounded narrative written from those figures. Teams that don't use
milestones simply see no block (a config/`ROADMAP.md`-declared roadmap is a planned
fast-follow). See [`docs/planning/phase5-reconcile-design.md`](docs/planning/phase5-reconcile-design.md).

### Identity aliases

People commit under multiple identities (work + personal email, multiple machines).
The `aliases` map collapses them into one canonical GitHub login so per-person
activity merges correctly:

```json
{ "aliases": { "canonical-login": ["alias-login", "personal@example.com"] } }
```

## Running on a schedule

`inky serve` makes the standup post on its own — an in-process scheduler
(no external cron) runs the full pipeline on `config.schedule` and posts to
Discord. `schedule.jobs` is **one or more** scheduled posts, each with its own
`cron` and `windowHours`, so you can run a daily standup **and** a weekly one
from a single worker:

```jsonc
"schedule": {
  "timezone": "America/New_York",
  "jobs": [
    { "cron": "0 9 * * 1-5", "windowHours": 24,  "label": "daily"  }, // 9am weekdays, past day
    { "cron": "0 9 * * 1",   "windowHours": 168, "label": "weekly" }  // 9am Monday, past week
  ]
}
```

`windowHours` per job defaults to the top-level `windowHours` if omitted. A
failed run is logged and the worker keeps going; run a single instance so the
channel isn't posted to twice. Deploy it to any always-on host (Render, Railway,
Fly.io, Docker) — see [`docs/deployment.md`](docs/deployment.md) for step-by-step
guides (incl. a `render.yaml`) and the required secrets.

### On-demand: the `/standup` slash command

The same `serve` process can also answer a **`/standup`** command in Discord, so
anyone can pull a standup for any window on demand. It connects over Discord's
gateway (no public URL needed). Options let a caller override the configured
defaults per run:

```
/standup range:This week stats:On per_person:false format:prose
```

`range` (Today / This week / This month) or a custom `days` (1–90); `stats`
(On / Off / Auto), `per_person`, and `format` (Bullets / Prose) — all optional,
each falling back to `inky.config.json`. Enable it by setting `DISCORD_BOT_TOKEN`
+ `discord.applicationId`, running `inky register-commands` once, then
`inky serve`. Full walkthrough: [`docs/discord-bot-setup.md`](docs/discord-bot-setup.md).

## License

MIT
