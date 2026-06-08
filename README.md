<p align="center">
  <img src="assets/inky-banner.png" width="680" alt="Inky — your team's daily standup, written for you" />
</p>

<p align="center">
  <a href="https://github.com/Doppel-Labs/inky/actions/workflows/ci.yml"><img src="https://github.com/Doppel-Labs/inky/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-3c873a.svg" alt="Node ≥20" />
</p>

# Inky 🐙

> Your team's daily standup, written for you.

Inky is a Discord bot that reads an organization's GitHub activity each day and
**writes the standup automatically** — per person and project-wide — with zero human
input. No more "what did you do yesterday?" prompts: the information already lives in
your commits, PRs, issues, and reviews. Inky reads it and writes the update.

Later it grows into a status tracker that reports where the project stands versus its
plan, by reconciling activity against a task tracker.

## Status

**Live** — the MVP (Phases 0–5) is complete and running in production (self-hosted on a
worker). See the [project plan](docs/planning/inky-project-plan.md) for the spec +
decisions, and [roadmap & Phase 6](docs/planning/roadmap-and-phase-6.md) for what's next.

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

Run **`inky help`** for the full reference. There are five commands:

| Command | What it does |
|---|---|
| `inky collect` | Fetch + normalize org activity, print as JSON (debugging). |
| `inky standup` | Build the standup once and post it (or print with `--dry-run`). |
| `inky ask "<question>"` | Answer a question about the activity, grounded in the digest (or print with `--dry-run`). |
| `inky serve` | Run forever: scheduled posts **+** the `/standup` & `/ask` bot. |
| `inky register-commands` | Register the `/standup` & `/ask` slash commands (run once). |

- **Window** (default = config `windowHours`, ending now): `--days N` · `--hours N` · `--since <ISO>` · `--until <ISO>`. Pair `--since`/`--until` for an exact past window, e.g. `--since 2026-06-01 --until 2026-06-02`.
- **Report**: `--stats` / `--no-stats` · `--stats-per-person` · `--roadmap` / `--no-roadmap` · `--format prose|bullets` · `--mechanical` (skip the AI).
- **Other**: `--config <path>` · `--provider <p>` · `--model <id>` · `--dry-run` · `--once` (serve: one cycle then exit) · `--no-watch` (serve: don't hot-reload the config file).

### Common recipes

```bash
inky standup --dry-run                              # preview today (nothing posted)
inky standup --days 1                               # post a daily standup
inky standup --days 7 --stats                       # weekly, with the team stats panel
inky standup --since 2026-06-01 --until 2026-06-02  # replay an exact past window
inky ask "what shipped this week?" --days 7 --dry-run   # grounded answer, printed
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
- **GitHub App** *(optional upgrade)* — instead of a PAT, authenticate as a **GitHub App installation**: no token expiry, higher rate limits, clean revoke (uninstall). Same read-only access. Set `github.appId` in config (or `GITHUB_APP_ID`) + the private key in env (`GITHUB_APP_PRIVATE_KEY_PATH` or `GITHUB_APP_PRIVATE_KEY`); the App wins if both are set. Walkthrough: [`docs/github-app-setup.md`](docs/github-app-setup.md).

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
  The PR-size distribution and the per-day commit activity each get a compact unicode
  sparkline (`▅█▄▂▂` XS→XL; `▄▇▅█▅▄▃` oldest→newest day). LOC is labeled *size, not
  score* — see [`docs/research/agentic-coding-metrics.md`](docs/research/agentic-coding-metrics.md).
- **Week-over-week trends.** With `trends: "auto"` (default), the panel adds direction
  arrows vs the previous equal-length window — e.g. `**12** PRs merged (↑3)`, `median
  PR cycle time: **18h** (↓4h)`. Shown wherever the stats panel shows; `--trends` /
  `--no-trends` (or `trends: "off"`) override. It costs one extra activity fetch (the
  prior window), so it only runs when the panel does (weekly+).
- **Per-person stats** (`statsPerPerson: true`, default) add a stat line under each
  name, paired with the team panel (shown where it shows). `--stats-per-person`
  forces them on even on the daily; set `false` to keep the post team-level only.
- **Output style.** `format: "bullets"` (default) gives scannable bullet points per
  person; `format: "prose"` (or `--format prose`) gives a narrative paragraph. The
  project summary stays prose either way.

### How LOC is counted

LOC is `additions + deletions` over **real** files only. A built-in noise filter excludes
lockfiles, generated code, vendored dependencies, build output, caches, and snapshots — the full
default list lives in [`packages/core/src/filter.ts`](packages/core/src/filter.ts).

- **Configurable.** Add repo-specific globs (picomatch syntax) via `extraNoisePatterns` in your
  config to exclude anything else that inflates counts (e.g. `"**/*.snap"`, `"docs/reference/**"`).
- **Bulk-import cap.** A single commit whose real churn exceeds `maxCommitLines` (default 300k)
  contributes **0** to LOC — path filtering can't catch a bulk commit of *real-looking* source
  (a vendored workspace, a reference-codebase import, an integration checkpoint), and one such
  commit can be 1M+ lines and swamp the whole team's totals. Tune via `maxCommitLines` in config.
- **Merge commits excluded.** GitHub reports a merge's stats as the full merged-branch diff, so
  Inky forces merge-commit LOC to **0** — otherwise merges double-count the branch's real commits
  and credit someone else's branch to whoever merged it.
- Both rules **only** zero LOC; the commit still counts toward commit and active-day totals. Treat
  per-person LOC as a rough *size* signal, not a precise or comparative score.

### Status vs plan (roadmap)

Inky can tie the window's activity to your **roadmap** and add a **📍 Status vs
plan** block — what advanced, what's stalled, what's at risk. There are two
sources; pick one with `source`:

**`github-milestones`** (default, no extra setup — the milestone's open/closed
counts and due date give progress and "on track" for free):

```jsonc
"roadmap": {
  "enabled": true,
  "source": "github-milestones",
  "milestoneFilter": "",   // optional: only track items whose title contains this
  "atRiskDays": 7          // flag an item at-risk when due within N days (or past)
}
```

**`roadmap-md`** — for teams that don't use Milestones: a checklist `ROADMAP.md`
in your repo, where `##` headings are goals and `- [ ]` / `- [x]` tasks give
progress. Add `(due: YYYY-MM-DD)` to a heading to track a deadline:

```jsonc
"roadmap": {
  "enabled": true,
  "source": "roadmap-md",
  "path": "ROADMAP.md",    // file location (default)
  "repo": "web",           // repo holding it (default: the first configured repo)
  "atRiskDays": 7
}
```
```markdown
## Q3 Launch (due: 2026-09-01)
- [x] Auth
- [ ] Dashboard
```

Off by default; enable in config or force per run with `--roadmap` / `--no-roadmap`.
Each tracked item shows progress, movement (advanced / stalled / completed / …),
and an ⚠️ at-risk note from its due date — all computed mechanically, with a short
grounded narrative written from those figures. Teams with neither a milestone nor a
`ROADMAP.md` simply see no block. (A static checklist carries no in-window signal, so
`roadmap-md` items show progress and at-risk, but not "advanced this period.") See
[`docs/planning/phase5-reconcile-design.md`](docs/planning/phase5-reconcile-design.md).

### Identity aliases

People commit under multiple identities (work + personal email, multiple machines).
The `aliases` map collapses them into one canonical GitHub login so per-person
activity merges correctly:

```json
{ "aliases": { "canonical-login": ["alias-login", "personal@example.com"] } }
```

### Opting people out (privacy)

Inky reads people's GitHub activity, so anyone can opt out. List canonical logins
in `excludePeople` and they're omitted entirely — never named, and their activity
isn't counted in the team stats:

```json
{ "excludePeople": ["carol"] }
```

A clean "don't report me." (Bots are already excluded by default via `excludeBots`.)

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
/standup range:This week private:true        # only you see it
```

`range` (Today / This week / This month) or a custom `days` (1–90); `stats`
(On / Off / Auto), `per_person`, and `format` (Bullets / Prose) — all optional,
each falling back to `inky.config.json`. Add **`private:true`** to get the reply
**ephemerally** — visible only to you, so a manager can inspect the team's
activity without posting it to the channel. Enable it by setting `DISCORD_BOT_TOKEN`
+ `discord.applicationId`, running `inky register-commands` once, then
`inky serve`. Full walkthrough: [`docs/discord-bot-setup.md`](docs/discord-bot-setup.md).

### Ask Inky about the work: the `/ask` slash command

The same bot answers **`/ask`** — a grounded question about the team's recent
activity, instead of the full standup:

```
/ask question:what did the team ship this week? range:This week
/ask question:what's still in flight on the api? private:true   # only you see it
```

Inky answers **only from the window's verified activity** (the same factual digest
the standup is built from): it cites real PRs, repos, and people, and if the answer
isn't in that activity it says so rather than guessing. Great for *"what shipped?"*,
*"what's in flight on X?"*, *"who reviewed Y?"*. It can't yet answer questions that
need code diffs or per-PR timing (e.g. *"why did #42 take so long?"*) — those come
with the agentic follow-up tier. `/ask` needs an LLM key (there's no mechanical
fallback). The CLI form is `inky ask "<question>" [--days N] [--dry-run]`.

## Telemetry (opt-in, off by default)

Inky is self-hosted, so by default the project has **no idea anyone is running
it** — no install count, no usage signal. The optional telemetry block turns on
an anonymous, aggregate ping so we can tell deployed instances apart from GitHub
stars and see which features get used. It is **off unless you turn it on**, and
when on, Inky prints a first-run line stating exactly that.

```jsonc
"telemetry": {
  "enabled": true,                          // off by default — nothing is sent until you opt in
  "endpoint": "https://your-ingest.example/t", // where events POST (run your own — see apps/ingest)
  "instanceId": "auto"                      // a random local UUID; pin a value on ephemeral hosts
}
```

**What's sent** is the entire payload — nothing else leaves your machine:

```jsonc
{ "event": "standup_run", "instanceId": "b3f1…", "version": "0.0.1", "ts": 1733400000,
  "props": { "trigger": "scheduled", "windowHours": 24, "dryRun": false, "provider": "anthropic" } }
```

Just an event name, a random install id, the Inky version, a timestamp, and a
few **scalar** counts/flags. The events are: `instance_started`, `heartbeat`
(daily liveness), `standup_run`, and `ask_run` (once `/ask` ships).

**What is _never_ sent:** org or repo names, contributor logins or emails, commit
or PR content, your config values, or any key. The wire schema rejects non-scalar
`props` so a nested identity payload can't ride along — you can read the refusal
to over-collect in [`packages/core/src/telemetry.ts`](packages/core/src/telemetry.ts).
The sink is a ~tiny endpoint you can self-host (see
[`apps/ingest`](apps/ingest/README.md)); design notes in
[`docs/planning/telemetry-design.md`](docs/planning/telemetry-design.md).

## License

MIT
