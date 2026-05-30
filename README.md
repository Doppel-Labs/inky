# Herald

> Your team's daily standup, written for you.

Herald is a Discord bot that reads an organization's GitHub activity each day and
**writes the standup automatically** — per person and project-wide — with zero human
input. No more "what did you do yesterday?" prompts: the information already lives in
your commits, PRs, issues, and reviews. Herald reads it and writes the update.

Later it grows into a status tracker that reports where the project stands versus its
plan, by reconciling activity against a task tracker.

## Status

Early development. See [`docs/planning/herald-project-plan.md`](docs/planning/herald-project-plan.md)
for the full spec, competitive analysis, and roadmap.

| Phase | Scope | State |
|---|---|---|
| 0 | Scaffold: TS project, config schema, core types | ✅ |
| 1 | `collect()` — GitHub API fetch + identity aliasing | ✅ |
| 2 | `normalize()` + `render()` — mechanical digest, LOC filtering, Discord delivery | ✅ |
| 3 | `summarize()` — AI-written standup (BYO key; Anthropic/Groq/OpenAI) | ✅ |
| 4 | Trigger + delivery — cron + `/standup` slash command | — |
| 5 | `reconcile()` — status vs roadmap (paid hook) | — |
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
cp herald.config.example.json herald.config.json   # set your org/repos
pnpm --silent collect                      # fetch + print org activity as JSON
pnpm --silent standup --dry-run --days 1   # build a standup and print it (no Discord)
```

**Need a GitHub token?** See [`docs/github-token-setup.md`](docs/github-token-setup.md)
for a secure, least-privilege (read-only) setup.

> Use `pnpm --silent` so only the JSON reaches stdout (without it, pnpm prints a
> script banner). The installed `herald` binary needs no such flag.

## Configuration

- **`herald.config.json`** — non-secret config: org, repos, window, identity
  aliases, Discord target, LLM provider/model. Copy from `herald.config.example.json`.
- **`.env`** — secrets only (`GITHUB_TOKEN`, and one LLM key). Never committed.

### LLM provider (the AI summary)

The summary writer is provider-agnostic — one swappable call seam. Pick a
`provider` in config and set the matching key in `.env`; only one key is needed,
and with none, Herald falls back to the deterministic mechanical render.

| `provider` | Key (env) | Default model | Notes |
|---|---|---|---|
| `anthropic` (default) | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` | Cheap + fast; ample for grounded summaries. Bump to `claude-sonnet-4-6`/`claude-opus-4-8` for headroom. |
| `groq` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | Fast, cheap, open-weight. |
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` | OpenAI, or any OpenAI-compatible endpoint via `baseUrl` (OpenRouter, local Ollama). |

`model` (config) or `--model <id>` overrides the default; `baseUrl` overrides the
endpoint (OpenAI-compatible providers only). The summary is constrained extraction
over a pre-built digest, so a small model holds up — defaults favor cost. Run
`herald standup --mechanical` to skip the AI entirely.

### Identity aliases

People commit under multiple identities (work + personal email, multiple machines).
The `aliases` map collapses them into one canonical GitHub login so per-person
activity merges correctly:

```json
{ "aliases": { "canonical-login": ["alias-login", "personal@example.com"] } }
```

## License

MIT
