# @inky/worker — the DB-backed (no-redeploy) worker

The hosted variant of `inky serve`. It reads its `Config` from **Postgres** (the
tenant rows the seed / dashboard write) instead of a file, and **hot-reloads on a
poll** — so you change the schedule or any setting by updating the database row and
the running worker picks it up within ~30s, **no redeploy**.

> Self-hosting? You don't need this. `inky serve --config inky.config.json` (file
> source, zero Postgres) is the simple path. This app is the no-redeploy hosted
> variant and the foundation the admin console writes to.

## How it differs from `inky serve`

| | `inky serve` (core CLI) | `@inky/worker` (this) |
|---|---|---|
| Config source | a JSON file (`--config`) | Postgres tenant rows |
| Change the schedule | edit the file… | update the DB row |
| …takes effect | on file change (or, on a **read-only** mount like a Render Secret File, only after a **redeploy**) | on the next poll — **no redeploy** |
| Needs Postgres | no | yes (`DATABASE_URL`) |

Both share core's `runServe` orchestration; only the config *source* differs (file
watch vs `dbConfigSource` poll).

## Environment

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string (the same DB the telemetry ingest uses). |
| `INKY_ORG` | ✅ | Which tenant (org login) to serve. |
| `GITHUB_TOKEN` | ✅¹ | PAT for reading the org. (Or GitHub App key vars — see core's auth docs.) |
| `DISCORD_WEBHOOK_URL` | ✅² | Where the standup posts. Read from env at runtime; not stored in the DB. |
| `DISCORD_BOT_TOKEN` | optional | Enables the `/standup` & `/ask` slash commands. |
| `INKY_DB_ENCRYPTION_KEY` | optional³ | Decrypts a webhook URL stored in the DB (only if you seeded one). |
| `ANTHROPIC_API_KEY` (or `GROQ`/`OPENAI`) | optional | The summary LLM key, matching `config.provider`. |

¹ PAT tenants need no GitHub App rows — auth falls back to `GITHUB_TOKEN`, exactly like a file config.
² Or `--dry-run`-equivalent; without a webhook and without a bot token the worker has nothing to run.
³ Only if the webhook lives in the DB. Keeping it in `DISCORD_WEBHOOK_URL` (env) is simpler and the secret never touches the DB.

## Commands

```bash
# Seed (or re-seed) the DB from a config file — run once to populate the tenant,
# and again whenever you want to change settings (the worker reloads on its poll).
DATABASE_URL=... INKY_DB_ENCRYPTION_KEY=... pnpm --filter @inky/worker seed --config inky.config.json

# Run the worker.
DATABASE_URL=... INKY_ORG=Your-Org pnpm --filter @inky/worker start
```

## Render cutover (Step 4) — moving the live bot off the Secret File

Do this deliberately; keep the existing `serve --config /etc/secrets/inky.config.json`
service as the fallback until the DB path is proven.

1. **Provision/point a Postgres** — set `DATABASE_URL` on the worker service (the
   Neon URL the ingest app already uses works).
2. **Apply migrations** to that DB if not already applied:
   `pnpm --filter @inky/db exec drizzle-kit migrate` (or run the SQL in `packages/db/drizzle`).
3. **Seed the tenant once:** run `inky-worker-seed --config <your config>` against the DB.
4. **Switch the worker's start command** (in `render.yaml` or the dashboard) from
   `node packages/core/dist/cli.js serve --config /etc/secrets/inky.config.json`
   to `node apps/worker/dist/index.js`, and add the `INKY_ORG` env var.
5. **Verify:** change a setting via a re-seed; within ~30s the logs show
   `inky: config changed — rescheduling.` and the new schedule is live — no restart.

After cutover, the "admin write path" is the seed (re-run with an edited config);
the admin **console** (Phase C) is just a UI over the same `upsertTenantConfig`.
