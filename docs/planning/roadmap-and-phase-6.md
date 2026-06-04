---
created: 2026-06-03
status: active
author: Claude main session
session: aa8bf74f-adef-4f15-a54b-4d2aa9d20e9e
branch: main
informed_by: Inky MVP shipped + hosted on Render (Phases 0–5); the open-core plan (inky-project-plan.md §3 business model, §7 roadmap); the recurring user question about editable schedules/settings needing persistent storage
notes: Where Inky goes next — the three work tracks (adoption, feature depth, the hosted tier) and a concrete Phase 6 (managed multi-tenant SaaS) sketch with sequencing, decisions, and the honest "when to start" call.
---

# Inky — roadmap & Phase 6

## Where we are (the inflection point)
The MVP is **done and running hosted**: Inky reads Doppel-Labs' GitHub activity and
posts a daily + weekly standup on a schedule, plus on-demand `/standup`, all from a
Render worker. It's public OSS (MIT). The open-core thesis (plan §3): **the free
self-host tool is the funnel; the paid hosted tier is the business.** Everything
below sorts into three tracks.

## Track A — Adoption & polish (do now; cheap, compounding)
Now that it's public, lower the friction to discover, trust, and run it:
- **Branding:** logo (`assets/inky-logo.svg` 🐙), README hero + a ~20s demo GIF / a real screenshot of a posted standup.
- **CI:** a GitHub Actions workflow running the 111 tests + typecheck on PRs (a green badge builds trust).
- **`CONTRIBUTING.md`**, issue/PR templates, a one-command quickstart.
- **Distribution:** submit to `awesome-selfhosted` / `awesome-discord`, a `r/selfhosted` + Product Hunt post, a short "why" blog.
- **Hygiene:** rotate the local `.env` API keys (never committed, but cheap insurance pre-announcement).

*Why first:* in open-core, OSS adoption **is** the go-to-market for the paid tier. Highest leverage per hour.

## Track B — Feature depth (as users pull it)
- `/standup` slash command — **done** (shipped + hosted).
- **`reconcile()` extensions:** a config/`ROADMAP.md`-declared roadmap (for the many teams that don't use GitHub Milestones), then GitHub Projects v2, then Linear / Notion adapters. (`source` enum already leaves room.)
- **Week-over-week trends** on the stats panel — direction beats a snapshot.
- **Slack delivery** — same core, a second delivery adapter; meaningfully widens the market.
- **Privacy controls** — per-person opt-out, since it reads people's activity (adoption + trust).

## Track C — Phase 6: the hosted multi-tenant tier (the business)

### What it is
A managed SaaS so a team uses Inky **without self-hosting**: install a GitHub App,
connect Discord, configure in a web dashboard, get billed. No PATs, no Render.

### Why this is the natural home for "editable settings"
The user already hit the wall: changing schedules/timezones/settings at runtime needs
**persistent writable storage** — today config is a static file (great for self-host /
a Render Secret File, read-only in a container). The dashboard + a database is exactly
what unblocks "users edit their own schedules with clicks." That capability and the
monetization are the *same* build.

### Architecture (sketch — keep it boring and cheap)
- **GitHub App** (replaces PATs): per-org install, fine-grained perms, per-install
  tokens, higher rate limits, clean revoke (uninstall). **Biggest single unlock, and a
  prerequisite** — worth building early since it improves *self-host* too.
- **Web dashboard** (Next.js, GitHub OAuth): install flow → connect a Discord channel
  (webhook) and/or add the bot → pick repos / schedules / settings → see run history + billing.
- **Data layer** (Postgres — Neon/Supabase): tenants, installations, configs, schedules,
  run history. (Config file → DB = editable-from-UI settings.)
- **Multi-tenant worker:** a job queue (pg-boss on the same Postgres / BullMQ) + a cron
  fan-out that runs each tenant's jobs through the **existing core pipeline**, per tenant.
- **Managed LLM keys:** Inky's own Anthropic key, metered + capped per tenant (a cost
  line in pricing). Keep a cheaper **BYO-key** tier too.
- **Discord at scale:** MVP = **webhook-only hosted** (no bot scaling needed). `/standup`
  for hosted tenants comes later via a single **sharded** bot routing per guild → tenant.
- **Billing:** Stripe subscriptions. Paid value = managed + status-vs-roadmap + history/trends.

### Build sequence (Phase 6)
1. **GitHub App** (auth foundation; also ships to self-host).
2. **Postgres + tenant/config model** (config → DB).
3. **Dashboard MVP** (install → connect Discord → configure).
4. **Multi-tenant worker** (queue + per-tenant cron, reusing the core).
5. **Billing + tiers.**
6. **Shared hosted `/standup` bot** (sharded) — last, optional.

### Key decisions (to make when starting)
- **Stack:** Next.js (dashboard + API) on Vercel + a separate always-on worker (Render/Fly) + Postgres (Neon) + pg-boss. Boring, cheap, fast.
- **Shared bot vs per-tenant webhooks:** webhooks first (simplest); shared bot later for `/standup` at scale.
- **Managed keys vs BYO:** managed = best UX (price the cost in); BYO = cheaper to run, more friction. Offer both as tiers.
- **Pricing:** likely flat **per-org** tier with a contributor cap (vs per-seat or per-standup). Validate with the first design partners.

### Risks
- Multi-tenant **Discord bot sharding** is real eng (defer via webhook-first).
- **LLM cost** at scale under managed keys — meter + cap from day one.
- **Trust/privacy** — reading orgs' private activity; clear data handling, least-privilege App scopes, eventually SOC2.
- The classic trap: **building the SaaS before there's demand.** Mitigate by leading with Tracks A/B + the GitHub App.

### Recommendation (honest)
**Don't start the full SaaS yet.** Do Track A (adoption) and build the **GitHub App**
from Track C early — it improves self-host *and* de-risks Phase 6. Let adoption create
pull; when 2–3 teams ask "can you host it for us?", that's the green light to build the
dashboard + billing.

## Concrete next steps (prioritized)
1. **Adoption polish:** README hero + logo, a demo GIF/screenshot, GitHub Actions CI, `CONTRIBUTING.md`.
2. **Rotate** the local `.env` keys.
3. **GitHub App** (stepping stone — better self-host UX + Phase 6 foundation).
4. **`reconcile()` → `ROADMAP.md`** declared roadmap (status-vs-plan for milestone-less teams).
5. **Watch for hosted demand** → kick off Phase 6 with the dashboard + Postgres.
