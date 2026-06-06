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

> **Strategy context (two memos in tension — read both):**
> [`inky-market-and-growth-strategy.md`](inky-market-and-growth-strategy.md) is the **floor** —
> realistic, conservative: a $3–8k/mo lifestyle SaaS selling a standup to Discord-native dev teams.
> [`inky-ambitious-strategy.md`](inky-ambitious-strategy.md) is the **ceiling** — the bull case:
> re-point the already-built metrics engine at the manager/founder buyer and it's a ~$420k–$1.4M ARR
> activity-intelligence play. They **agree on the next concrete move** (`/ask` + telemetry first), which
> is the cheap experiment that decides which memo is right.

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
- **Telemetry (measurement — the week-one prerequisite both strategy memos demand).** Inky is self-hosted, so today you have **zero signal**: no install count, no active-team count, no feature-usage data — every funnel number is a guess. Build the minimal opt-in, anonymous, aggregate event stream: `instance_started` · `heartbeat` · `standup_run` · `ask_run` (once it ships) · `footer_link_clicked`. Trust-gated (opt-in, no org/repo/contributor data, README-disclosed) since the audience is privacy-conscious self-hosters. **This unblocks the one experiment that decides floor-vs-ceiling** (does `/ask` get used? does the manager buyer convert?) and makes Loop 1 (the standup footer → installs viral coefficient) measurable. Full shape in [`telemetry-design.md`](telemetry-design.md).
- **Keys:** nothing to rotate — `.env` was gitignored the whole time and never committed (verified), so the public repo exposes no secrets. Only rotate on a *known* exposure (a screenshot/paste). The fine-grained PAT already auto-expires (~90 days).

*Why first:* in open-core, OSS adoption **is** the go-to-market for the paid tier. Highest leverage per hour.

## Track B — Feature depth (as users pull it)
- `/standup` slash command — **done** (shipped + hosted).
- **`reconcile()` extensions:** `ROADMAP.md`-declared roadmap — **done** (`roadmap-md` source). Next: GitHub Projects v2, then Linear / Notion adapters (see below). (`source` enum already leaves room.)
- **Week-over-week trends** on the stats panel — **done** (`config.trends`, ↑/↓/→ vs the prior window).
- **Per-person opt-out** (`excludePeople`) — **done** (privacy/trust).
- **Slack delivery** — **on the roadmap as the #1 GTM bet** (see *Next bets* below + `inky-market-and-growth-strategy.md`). It's the single market-unlock: ~8–10× the *paying* SAM, since the GitHub-org teams that actually pay live in Slack, not Discord. Lands with the Phase 6 hosted tier (managed multi-workspace OAuth) and gets its own Product Hunt moment. Self-host stays Discord for now.

### Backlog (captured from discussion, not yet scheduled)
- **Team-performance visuals (charts).** Discord renders markdown/embeds, not charts, so three tiers: (1) **now, cheap, on-brand** — unicode sparklines / mini bar charts in the stats panel (e.g. a 6-week sparkline next to each trend metric); zero deps, fits the in-Discord ethos. (2) **image attach** — render a PNG (QuickChart.io URL, or a tiny serverside chart) and attach to the embed; richer, still self-host-able. (3) **the real home** — the Phase 6 web **dashboard** with interactive charts over history. *Dependency:* anything beyond "this vs last window" needs **stored history** (past windows) — which is Phase 6 Postgres. So: a this-vs-last sparkline is doable now (pairs with the trends feature); multi-week/quarter charts wait for storage + dashboard.
- **Linear / task-tracker integration.** Architecturally clean: it's another `reconcile()` **`source`** (the enum + the `roadmap-md`/milestone precedent already make this additive — fetch goals/issues from Linear, map to `RoadmapItem`, reuse `reconcileDeclared`-style logic). **But** it needs Linear **OAuth / API tokens**, which is real auth surface and a strong **paid-tier differentiator**, so it leans Phase 6. *Self-host MVP path:* a BYO Linear API key (like the BYO-LLM-key model) could ship a `source: 'linear'` without OAuth, ahead of the hosted tier. Same pattern later for Notion/Jira. This is high-value: "status vs plan" against the tracker teams actually use is the paid hook (plan §1 secondary wedge).
- **Multi-channel & DM delivery (user, 2026-06-05).** "Add Inky to any/other channel" + "DM Inky to inspect performance privately." Three distinct pieces, increasing in lift:
  - **On-demand in any channel — already done.** `/standup` works in every channel the bot is in, no per-channel setup. So the *interactive* "any channel" ask is met today; what's missing is *scheduled* delivery beyond the single webhook.
  - **Multiple scheduled channels (cheap-ish).** Today one webhook = one channel (`render.yaml`/`DISCORD_WEBHOOK_URL`). Self-host: add `discord.webhookUrls[]` or a per-`schedule.job` channel/webhook so different standups post to different channels. **Phase 6 makes this first-class:** the new `channels` table is already one-tenant→many-channels, so the dashboard picks channels per schedule. (See `packages/db/src/schema.ts`.)
  - **Private DM delivery / ephemeral stats (high-value, needs the bot not a webhook).** A manager privately inspects the team. Two forms, cheapest first: (a) **ephemeral `/standup` (or `/team-stats`) reply** — Discord interaction replies can be flagged ephemeral so only the invoker sees them; small change to the existing `commands.ts`/`bot.ts` path, no DM plumbing. (b) **true DM** — the bot DMs a user the standup/stats on a schedule or on request; needs a user opt-in + the bot online (not webhook-only). Strong trust/privacy feature; (a) is a quick win, (b) pairs with the Phase 6 sharded bot.
- **Conversational drill-down — "chat with Inky about the work" (user, 2026-06-05).** Ask Inky questions — "what did Bob accomplish this week?", "why did the API PR take so long?" — and have it drill into the actual commits/PRs/reviews and answer. This is the **big, differentiated** one: a grounded Q&A *agent* over org activity, not a fixed report. Architecture: an LLM with **tools** to fetch activity on demand (commits, PR diffs, reviews) layered over the existing `collect()`/`github.ts` data, holding the **same grounding discipline as the standup** (answer only from verified fetched facts — the tool-forced `emit` pattern, no invented claims). Tiers: (1) **one-shot `/ask <question>`** — a focused collect + a grounded single answer (buildable on the current bot, self-host-able). (2) **conversational thread** — Inky keeps context and calls tools iteratively to drill down (agentic; heavier). (3) the Phase 6 dashboard as a richer chat surface over stored history. **A premium hook** ("ask your codebase what your team actually did") and a natural paid-tier feature; the one-shot `/ask` is the testable MVP. Privacy note: pairs with the ephemeral/DM delivery above so a manager can ask privately.
  - **Tier 1 — DONE in code (2026-06-06).** `inky ask "<q>"` + `/ask question:… [range|days] [private]`. `packages/core/src/ask.ts` `buildAnswer()` reuses `collect()` + `buildGroundingDigest()` and forces a single grounded `answer` tool call (`{answer, grounded}`); answers ONLY from the window's digest, sets `grounded:false` rather than guessing, requires an LLM key (no mechanical fallback). Telemetry fires `ask_run` (scalar only — never the question text). **Honest tier-1 limit:** the digest has no diffs or per-PR timing, so "why did #42 take long?" returns `grounded:false` — that refusal *is* the grounding working, and tells us which "why" questions justify **tier 2** (the agentic tool-using thread). Design: [`ask-feature-design.md`](ask-feature-design.md).

### Next bets (sequenced) — from the market & growth strategy
> Full reasoning, market sizing, and the realistic revenue band live in
> [`inky-market-and-growth-strategy.md`](inky-market-and-growth-strategy.md). The honest
> read: this is a **$3–8k/mo lifestyle SaaS** (BASE), ceiling ~$10–25k/mo *only if* Slack
> ships — not a venture business. Sequence accordingly:
1. **Slack delivery** *(horizontal — the market unlock)* — escapes the low-WTP Discord
   niche into the ~8–10× larger Slack pool. Highest leverage of anything on the roadmap.
2. **Conversational drill-down, one-shot `/ask`** *(vertical — the differentiated paywall)* —
   ship into the free tool first to prove demand; it's the feature a manager pulls out a
   card for, and the grounding discipline is the moat vs. generic cron-agents. **Tier 1 shipped
   in code (2026-06-06)** — see the backlog item above; next is real-usage signal (`ask_run`
   telemetry) to decide whether to build the agentic tier 2 and paywall it.
3. **Linear BYO-key `reconcile()` source** *(vertical — cheap proof of the paid thesis)* —
   "status vs the plan you actually use" without the OAuth tax. (Backlog item above.)

**Direction (documented):** bets 2–3 are the seed of a **source-agnostic agent harness** — abstract the
GitHub pipeline so the scheduled digest *and* `/ask` call sources as tools (GitHub → **Linear** → GitHub
Projects v2 → Notion/Granola). Positioning = grounded **intention vs execution** (planned vs shipped vs
**untracked** work — GitHub often ships what the tracker never tracked). Guardrails: Slack = delivery *not*
source (no whole-org ingest), no general-assistant drift, grounding discipline scales with sources. Full
sketch + four-quadrant reconcile model + sequencing in [`multi-source-harness-strategy.md`](multi-source-harness-strategy.md).

**Pricing (documented):** open-core; free self-host forever + hosted **per-org flat, contributor-capped** —
**Starter $19/mo** (BYO key, ~10 contributors, Slack *or* Discord) and **Pro $49/mo** (managed key,
~25, `/ask` + private DM digests + status-vs-plan + history). Undercuts Geekbot ($3/user/mo, *and they
still type*); 10× below eng-analytics tools. **GTM** = product-led / OSS-funnel (Show HN, Product Hunt,
awesome-lists, comparison-page SEO, the standup footer as zero-CAC reach); land on Discord-native dev
teams, expand via Slack. **Competitors:** async standup bots (human-input), event firehoses (noisy),
eng analytics (enterprise-priced), generic cron-agents (ungrounded). None own *zero-input, GitHub-derived,
grounded, in-chat*. **Prerequisite:** instrument the funnel — there's currently zero usage telemetry.

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
> Decisions locked in **`phase6-design.md`** (stack, monorepo layout, data model, pricing).
0. **Decisions doc** — **done** (`phase6-design.md`).
1. **GitHub App** (auth foundation; also ships to self-host) — **done**; **H3 client-cache
   fix done** (memoized `resolveOctokit`, the single-tenant seed of the per-installation cache).
2. **Monorepo migration** (pnpm workspace; `src → packages/core`, tests green from new path).
3. **Postgres + tenant/config model** (`packages/db`, Drizzle; config → DB).
4. **Dashboard MVP** (install → connect Discord → configure).
5. **Multi-tenant worker** (queue + per-tenant cron, reusing the core). **⚠️ gated on a live
   GitHub-App test.**
6. **Billing + tiers.**
7. **Shared hosted `/standup` bot** (sharded) — last, optional.

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
1. **Adoption polish** — **done:** README hero + badges, GitHub Actions CI, `CONTRIBUTING.md`, issue/PR templates, a distribution kit. *(Remaining: a demo GIF/screenshot — needs a live capture; distribution posts.)*
2. *(Keys: no rotation needed — `.env` was never committed; the PAT auto-expires.)*
3. **GitHub App** (self-host auth foundation) — **done.** *(Multi-tenant install flow still pending — Phase 6.)*
4. **`reconcile()` → `ROADMAP.md`** declared roadmap — **done** (`roadmap-md` source).
5. **Week-over-week trends** + **per-person opt-out** — **done.**
6. **Next, still self-host / Discord (Track B):** a this-vs-last **sparkline** in the stats panel (cheap visual, pairs with trends); a **BYO-key `source: 'linear'`** reconcile adapter (status-vs-plan against Linear without OAuth).
7. **Phase 6 — STARTED** (decisions in `phase6-design.md`). Done: step 0 (decisions doc) +
   step 1 (**H3 fix** — memoized `resolveOctokit`). **Next: step 2, the monorepo migration**
   (`src → packages/core`), then `packages/db` (Postgres/Drizzle) + the dashboard. The
   multi-tenant worker (step 5) is gated on a live GitHub-App test.
