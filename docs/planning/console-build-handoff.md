---
created: 2026-06-10
status: active
author: Claude main session
branch: feat/loc-merge-cap-cleaning
informed_by: admin-configurable-schedule-and-console.md (Phase A done, Phase B partial, Phase C = this UI); phase6-design.md (stack, data model, config file→DB); inky-design-identity.md + site/index.html (the friendly Blurple brand the console should match)
notes: Self-contained HANDOFF for another session — build the thin self-host admin console (web app option #2). Goal — edit Inky's config (esp. the schedule) from a UI instead of editing JSON + redeploying. Deliberately scoped to single-tenant self-host; NO billing, NO GitHub-OAuth install flow, NO multi-tenant fan-out (that's the full Phase 6 SaaS, explicitly out of scope). Estimated ~3–5 focused days because most of the backend already exists.
---

# HANDOFF — thin self-host admin console (web app #2)

## The one-line goal
Let an **admin** change Inky's schedule (and other config) from a small web UI, with the running
`serve` worker picking it up **without a redeploy**. That's it. Not the SaaS.

## Why this is Medium, not Large (most of it is already built)
- ✅ **DB + schema** (`packages/db`): `tenants/installations/configs/channels/runs` rows;
  `loadTenantConfigByOrg` / `upsertTenantConfig`; webhook URLs encrypted at rest; the **same
  `ConfigSchema`** (zod) validates file *or* DB config.
- ✅ **Hot-reload from the DB** (`packages/db/src/db-config-source.ts`): `dbConfigSource` is a
  `ConfigSource` that polls the `configs` row for changes; `startWorker({ watch })` already swaps
  live config and rebuilds cron jobs only when `schedule` changed (Phase A, shipped).
- ✅ **Config-as-data**: a `Config` is a `Config` whether it came from a file or a row, so the
  pipeline (`buildStandup`) is called identically.

So the worker can *already* run off DB config and hot-reload. What's missing is: a way to **write**
those rows from a UI, the **app wiring** to run the worker off the DB, and the **UI** itself.

## Scope — IN
1. **PAT-tenant support.** Relax `loadTenantConfigByOrg`/`upsertTenantConfig` so a tenant with **no
   GitHub-App installation row** is allowed (the live deploy authenticates with a PAT, not the App).
   Today they require `appId`+`installationId`.
2. **App wiring (`apps/worker` or extend `apps/ingest`).** Core's `serve` can't construct
   `dbConfigSource` (core must not depend on `@inky/db` — would be circular). A small app that
   depends on **both** core and db builds `dbConfigSource(db, org)` and passes its `.watch` to
   `startWorker`. This is the step that flips a deploy from "Render Secret File" to "DB".
3. **Admin API.** Authenticated `GET /config` + `PATCH /config` (zod-validated against `ConfigSchema`)
   → `upsertTenantConfig`. **Secrets stay in env** — the API never reads/writes the LLM key, GitHub
   token, or raw webhook secrets. On write, the worker's poll picks it up (no restart).
4. **Web console (the UI).** A thin page over the API:
   - a **schedule editor** — "run on [days] at [time] in [timezone]," plus add/remove jobs
     (daily/weekly), mapping to the `schedule.jobs[]` cron shape;
   - the safe config knobs: repos[], windowHours, stats/trends/format, roadmap on/off, excludePeople[];
   - a **read-only run-history** list from the `runs` table (last N: when, window, status, posts, error).
   - Built in the **friendly Blurple brand** (`site/index.html` / `inky-design-identity.md`) so it
     matches — reuse the tokens, the Inky icon, the card style.

## Scope — OUT (do NOT build here)
- ❌ Billing / Stripe. ❌ GitHub-OAuth login + App **install** flow. ❌ Multi-tenant cron fan-out.
- ❌ Managed LLM keys / metering. ❌ Editing secrets from the UI (they stay in env).
- These are the full Phase 6 SaaS (`phase6-design.md`) — gated on demand signal, out of scope here.

## Auth (keep it simple for self-host)
Single admin. A shared admin token / password in env (e.g. `INKY_ADMIN_TOKEN`) gating the API +
UI is enough for v1 — this is one team's self-hosted instance, not multi-tenant. Don't build OAuth.

## Stack
Match `phase6-design.md`: **Next.js (App Router)** for the console + API routes, **Drizzle** via
`@inky/db`. Deploy alongside the worker. (A non-Next minimal Node API + the static `site/` styling
is acceptable if lighter is preferred — but Next aligns with the eventual dashboard.)

## Build sequence (each step shippable / testable)
1. **PAT-tenant** — relax the two db functions + tests (allow no-installation tenant). *(½ day)*
2. **App wiring** — `apps/worker` (or `apps/ingest`) constructs `dbConfigSource` → `startWorker({watch})`;
   prove a DB row edit reschedules the live worker with no restart. *(½–1 day)*
3. **Admin API** — `GET`/`PATCH /config`, token-gated, zod-validated, secrets excluded. Tests. *(1 day)*
4. **Console UI** — schedule editor + config form + run-history, friendly brand. *(1.5–2 days)*

## Acceptance criteria
- An admin edits the schedule in the UI → the **running** `serve` worker changes its cron jobs with
  **no redeploy/restart** (the redeploy-to-change friction from the admin-config doc is gone).
- A malformed edit is rejected by `ConfigSchema` at the API and never reaches/breaks the worker.
- Secrets are never sent to or stored by the UI/API; they remain env-only.
- New tests green; existing core/db tests stay green.

## Pointers
- `docs/planning/admin-configurable-schedule-and-console.md` — the phased plan (A done, B partial).
- `docs/planning/phase6-design.md` — stack, data model, config file→DB.
- `packages/db/src/db-config-source.ts`, `packages/core/src/worker.ts` (the `watch` reload),
  `packages/core/src/config.ts` (`ConfigSchema`), `packages/db` (`loadTenantConfigByOrg`/`upsertTenantConfig`).
- Brand: `site/index.html`, `docs/planning/inky-design-identity.md` (friendly Blurple tokens + the Inky icon).
