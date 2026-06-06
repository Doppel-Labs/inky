---
created: 2026-06-06
status: active
author: Claude main session
session: doppellabs-perf-review-jun5 (Inky build session)
branch: feat/loc-merge-cap-cleaning
informed_by: User request to make Inky run every day and to make scheduling (and config generally) admin-configurable, ideally via a console later. Current state read from inky.config.json + config.ts (config-as-data) and the cron worker (serve).
notes: Direction + phased backlog for admin-configurable settings — starting with the schedule, ending at a web console. Captures what already works today (config-as-data file) and the gap (edit-JSON-then-redeploy, no UI). Not a committed spec; sequence/scope to be confirmed before building.
---

# Admin-configurable settings → admin console

## What the user wants

- **Now:** Inky runs every day — daily cron `0 9 * * 1-5` → `0 9 * * *`. Done in the local
  `inky.config.json`; the **live** worker reads a Render Secret File at
  `/etc/secrets/inky.config.json` (the repo copy is gitignored), so the live change requires
  editing that Secret File + restarting the worker. This redeploy-to-change friction is exactly
  what Phase A/B below remove.
- **Soon:** the schedule (and config in general) should be **changeable by an admin** without a
  developer.
- **Later:** ideally a **console/UI** to manage it.

## Where we are today

Inky is already **config-as-data** (`config.ts` comment: "the same core pipeline runs self-hosted
or multi-tenant by loading one config object"). The full schedule lives in `inky.config.json`:

```json
"schedule": {
  "timezone": "America/Los_Angeles",
  "jobs": [
    { "cron": "0 9 * * *", "windowHours": 24,  "label": "daily" },
    { "cron": "0 8 * * 1", "windowHours": 168, "label": "weekly" }
  ]
}
```

So it *is* admin-configurable — but only for an admin who can **edit the file and redeploy** the
Render worker. The two real gaps:

1. **No hot reload.** `inky serve` reads config once at boot and schedules cron jobs then; a config
   change needs a worker restart/redeploy to take effect.
2. **No UI.** Editing JSON + redeploying is a developer task, not an admin one. Secrets correctly
   live in env (never the file), which a console must preserve.

## Phased path (each phase is independently shippable)

### Phase A — Hot-reloadable config (no UI yet)
Make `serve` re-read config and rebuild its cron jobs without a redeploy. Either watch the config
file (`fs.watch`) or expose an authenticated `POST /reload` on the worker. Lowest effort, removes
the redeploy pain immediately, and is the prerequisite for any console (the console just edits the
source the worker reloads from).

### Phase B — Config persistence + a small admin API
Move the editable config out of a committed file into a writable store (a JSON blob in the DB —
`packages/db` already exists — or a Render-mounted file). Add an authenticated admin API:
`GET /config`, `PATCH /config` (validated by the existing Zod `ConfigSchema`). Secrets stay in env;
the API only ever touches non-secret config. On write → trigger the Phase-A reload.

### Phase C — Web console
A thin UI over the Phase-B API: edit the schedule (cron builder / "run on these days at this time"
instead of raw cron), org/repos, aliases, exclude-people, stats toggles, `maxCommitLines`, etc.
Plus a **"Run now"** button (manual trigger) and a **schedule preview** ("next runs: …"). Auth: a
single admin password/login to start; per-org roles if/when multi-tenant.

## Design constraints to honor

- **Secrets never enter config or the console.** GitHub/Discord/LLM keys stay in env — the
  console manages non-secret settings only (the codebase already enforces this split).
- **Validate every write** through `ConfigSchema` (`safeParse`) so a bad edit can't crash `serve`.
- **One source of truth.** Whatever the console writes is exactly what `serve` reloads — no drift
  between a committed `inky.config.json` and a live override.
- **Multi-tenant-ready.** Config is already per-org-shaped; keep the store keyed so a hosted tier
  can hold many orgs' configs without a rewrite.
- **Cron UX.** Admins shouldn't hand-write cron — offer day-of-week checkboxes + a time picker and
  generate the expression, but keep raw-cron as an escape hatch.

## Smallest next step

Phase A (hot reload) alone delivers most of the "admin can change it" value: an admin edits the
config source and the running worker picks it up — no developer redeploy. Build the console on top
once that loop exists.
