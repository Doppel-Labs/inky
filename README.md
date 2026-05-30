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
| 3 | `summarize()` — AI-written standup (Anthropic, BYO key) | 🚧 |
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
  aliases, Discord target, model. Copy from `herald.config.example.json`.
- **`.env`** — secrets only (`GITHUB_TOKEN`, `ANTHROPIC_API_KEY`). Never committed.

### Identity aliases

People commit under multiple identities (work + personal email, multiple machines).
The `aliases` map collapses them into one canonical GitHub login so per-person
activity merges correctly:

```json
{ "aliases": { "canonical-login": ["alias-login", "personal@example.com"] } }
```

## License

MIT
