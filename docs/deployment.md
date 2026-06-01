---
created: 2026-06-01
status: active
author: Claude main session
session: aa8bf74f-adef-4f15-a54b-4d2aa9d20e9e
branch: main
informed_by: Phase 4 worker build (src/worker.ts, src/standup.ts, src/config.ts schedule block); herald-project-plan.md §5 host-agnostic architecture
notes: How to run Herald as a long-running worker (herald serve) that posts the standup on a schedule, and how to deploy it to Railway / Fly.io / Render / Docker.
---

# Deploying Herald

Herald's core is host-agnostic. To make it **run on its own**, you run the
long-running worker:

```bash
herald serve          # schedules the standup forever (config.schedule)
herald serve --once   # run one cycle now and exit (great for a first live test)
herald serve --once --dry-run   # build + print, don't post (no webhook needed)
```

`serve` uses an in-process scheduler ([croner](https://github.com/hexagon/croner)),
so there's no external cron, no extra service — just one always-on process. Each
tick runs the full `collect → summarize → render → post` pipeline. A failed run
(GitHub hiccup, LLM error, Discord 5xx) is logged and the worker keeps going; if a
run outlasts its interval, the next tick is skipped rather than overlapping.

## 1. Configure the schedule

In `herald.config.json`:

```jsonc
{
  "org": "your-org",
  "windowHours": 24,            // keep this in step with the cadence (see below)
  "schedule": {
    "cron": "0 9 * * 1-5",      // 9:00am, Mon–Fri (standard 5-field cron)
    "timezone": "America/New_York"   // IANA name; DST-aware
  }
}
```

**Match `windowHours` to your cadence** so the window doesn't overlap or leave
gaps: `24` for a daily post, `168` for a weekly one. Defaults: `0 9 * * *` (9am
every day) in `UTC`, 24h window.

## 2. Set secrets (environment only — never in config)

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | yes | Read org activity (a fine-grained PAT with repo read — see `docs/github-token-setup.md`). `GH_TOKEN` also accepted. |
| `DISCORD_WEBHOOK_URL` | yes (to post) | Discord incoming webhook for the target channel. Preferred over `discord.webhookUrl` in config. |
| `ANTHROPIC_API_KEY` | for AI summary | Or `GROQ_API_KEY` / `OPENAI_API_KEY`, matching `config.provider`. Without one, Herald posts the deterministic (mechanical) render. |

Create the Discord webhook: **Channel → Edit Channel → Integrations → Webhooks →
New Webhook → Copy Webhook URL**. Anyone with that URL can post to the channel, so
treat it as a secret.

> **One instance only.** Each running `serve` posts on the schedule — run two and
> the channel gets the standup twice. Keep a single worker (one dyno / one machine
> / `replicas: 1`).

## 3. Verify locally before deploying

```bash
# Build + print, no Discord needed:
GITHUB_TOKEN=$(gh auth token) pnpm dev serve --once --dry-run

# Real post to your channel, once:
GITHUB_TOKEN=$(gh auth token) DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/… \
  pnpm dev serve --once
```

## 4. Deploy

The worker is a plain Node process; any always-on host works. Build first
(`pnpm build` → `dist/`), then run `node dist/cli.js serve`. Provide
`herald.config.json` (commit it to your private fork, or mount it) and set the
secrets above as the platform's env vars / secrets.

### Docker (any host)

```bash
docker build -t herald .
docker run -d --name herald --restart unless-stopped \
  -v "$PWD/herald.config.json:/app/herald.config.json:ro" \
  -e GITHUB_TOKEN -e ANTHROPIC_API_KEY -e DISCORD_WEBHOOK_URL \
  herald
```

The image's default command is `herald serve`. (`docs/` and local secrets are
excluded via `.dockerignore`; the runtime stage ships only production deps.)

### Railway

1. New project → Deploy from your repo. Railway detects the `Dockerfile` (or the
   `Procfile`'s `worker:` process).
2. **Variables**: add `GITHUB_TOKEN`, `DISCORD_WEBHOOK_URL`, and your LLM key.
3. Commit `herald.config.json` to your (private) fork, or add it via a volume.
4. Ensure a single replica. Logs show `worker started — … Next run: …`.

### Fly.io

1. `fly launch --no-deploy` (it'll use the `Dockerfile`); set `[processes] app = "node dist/cli.js serve"` or keep the image CMD.
2. `fly secrets set GITHUB_TOKEN=… DISCORD_WEBHOOK_URL=… ANTHROPIC_API_KEY=…`
3. Bake `herald.config.json` into the image (fork) or attach a volume.
4. `fly deploy`; scale to one machine: `fly scale count 1`.

### Render

1. New **Background Worker** from your repo (not a Web Service — there's no HTTP
   port). Build: `pnpm install && pnpm build`. Start: `node dist/cli.js serve`.
2. Add the secrets as **Environment** variables.
3. Provide `herald.config.json` via the repo (fork) or a Secret File mounted at
   `/app/herald.config.json`.

## Troubleshooting

- **`no Discord webhook configured`** — set `DISCORD_WEBHOOK_URL` (or
  `discord.webhookUrl`), or use `--dry-run` to print.
- **Posts the mechanical render, not the AI one** — the provider's key isn't set;
  the log line says which env var is missing.
- **Nothing posts at the scheduled time** — check the worker is actually running
  (`worker started … Next run` should be in the logs) and that `timezone` is the
  one you expect. Test the wiring immediately with `serve --once`.
- **Double posts** — more than one worker instance is running; scale to one.

## What's next (not in the worker)

The on-demand **`/standup` Discord slash command** is a separate, heavier piece
(it needs a registered Discord application + bot token and an interactions
transport). It's deferred — see `herald-project-plan.md` §10.
