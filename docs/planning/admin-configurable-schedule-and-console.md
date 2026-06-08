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

### Phase A — Hot-reloadable config (no UI yet) — ✅ DONE (2026-06-08)
`serve` re-reads config and rebuilds its cron jobs without a restart, from a **pluggable config
source** so the source is swappable and the worker stays decoupled from where config lives. What
shipped:

- **`ConfigSource` interface + `fileConfigSource`** (`packages/core/src/config-source.ts`): the
  source the worker reads once and subscribes to. The file source watches by **mtime polling**
  (robust where `fs.watch` is flaky); a bad edit routes to `onError` and polling continues, so a
  malformed config never takes the worker down. Zero new deps — the only thing a self-hoster needs.
- **`startWorker` reload** (`worker.ts`): new `opts.watch` (a subscribe fn). On change it swaps the
  live config used by each run and, **only if `schedule` changed**, tears down + rebuilds the cron
  jobs (and the heartbeat, which depends on the timezone). No `watch` → identical to before
  (back-compat; all prior worker tests still pass).
- **`serve` wiring + `--no-watch`** (`cli.ts`): file-watch on by default; the `read` re-applies
  `--provider`/`--model` overrides so a reload doesn't drop them.
- Tests: core 198 (+8 — file source change-detection/error/stop; worker reschedule-on-change,
  no-reschedule-when-unchanged, swallowed reload error, stop-unsubscribes).

Caveat (known, by design): on a **read-only mount** (the Render Secret File) the file can't change
at runtime, so file-watch no-ops there. Removing the redeploy on Render needs the DB source (below).

### Phase B — Config persistence + a small admin API — ◐ PARTIAL
**Persistence already existed** (`packages/db`: `tenants/installations/configs/channels` rows;
`loadTenantConfigByOrg`/`upsertTenantConfig`; webhook encrypted at rest; same `ConfigSchema`).
**Added (2026-06-08):** **`dbConfigSource`** (`packages/db/src/db-config-source.ts`) — a
`ConfigSource` backed by those rows that polls for changes, so the worker can hot-reload from the DB
with no redeploy. Lives in @inky/db (depends on core, not vice-versa), so core never imports
Postgres. Tests: db 22 (+4).

**Remaining for Phase B:**
- **PAT-tenant support.** `loadTenantConfigByOrg`/`upsertTenantConfig` currently *require* GitHub
  App auth (`appId`+`installationId`). The live deploy uses a PAT, so backing it with the DB source
  needs this assumption relaxed (allow a tenant with no installation row).
- **App-level wiring.** Core's `serve` can't construct `dbConfigSource` (that'd make core depend on
  db — circular). The "run the hosted worker off the DB" wiring belongs in an app that depends on
  both (e.g. `apps/ingest` or a new `apps/worker`): build `dbConfigSource(db, org)` and pass its
  `.watch` to `startWorker`. This is the small integration step that flips Render onto the DB.
- **Admin API.** Authenticated `GET /config` + `PATCH /config` (Zod-validated) writing via
  `upsertTenantConfig`; secrets stay in env. On write → the worker's poll picks it up.

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

Phase A (hot reload) is done — file-source self-host/local config changes are picked up live, and
the DB source is built and tested. **The next concrete step to make the live Render bot reloadable
is the two Phase-B items:** relax the store to allow a PAT tenant, then add an app-level entry that
wires `dbConfigSource` into `startWorker` and point Render at it (with `DATABASE_URL` + the config
seeded once via `upsertTenantConfig`). The console (Phase C) then just writes those same rows.
