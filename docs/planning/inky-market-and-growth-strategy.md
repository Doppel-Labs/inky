---
created: 2026-06-05
status: active
author: product-strategist agent
branch: main
informed_by: README.md; docs/planning/roadmap-and-phase-6.md; docs/planning/inky-project-plan.md (§1-3,§8); docs/planning/phase6-design.md; docs/planning/distribution-kit.md; packages/core + packages/db source (build-state verification); web research — OpenClaw cron docs, Geekbot/Standuply pricing, Discord dev-community size, GitHub org counts, freemium dev-tool conversion benchmarks (all linked inline)
notes: Realistic (not optimistic) market + revenue strategy memo for Inky. Bottoms-up TAM/SAM/SOM, a low/base/high revenue band over 3 years for a solo part-time maintainer, positioning within the scheduled-autonomous-agent trend (OpenClaw/cron-agent pattern), scoped vertical/horizontal expansion with effort-vs-leverage, and a concrete pricing + paywall recommendation. Honest verdict: lifestyle SaaS, not venture.
---

# Inky — Market & Growth Strategy (realistic memo)

## Executive summary

Inky is a genuinely good product with a sharp wedge ("standups are *derived, not solicited*") sitting in a small, defensible niche. The honest read: **this is a $2–10k/mo lifestyle SaaS with a realistic ceiling around $10–25k MRR if Slack ships and one premium feature lands — not a venture business.** The constraint is not product quality; it's the **size of the reachable market** (GitHub-org teams that *also* live in Discord and *also* will pay for standups) and the **structural ease of self-hosting a free MIT tool**.

Three things are true at once:
1. **The wedge is real and underserved.** Incumbents (Geekbot $3/user/mo, DailyBot, Standuply) all make humans type their update. Inky reads GitHub and writes it. No direct competitor owns "zero-input, GitHub-derived, AI-written standup in your chat tool."
2. **The reachable market is narrow.** Discord-native dev orgs skew indie/OSS/gamedev/web3/AI — exactly the segment with the *lowest willingness to pay for a standup tool* and the *highest ability to self-host a free MIT repo*. This is the core tension.
3. **Inky is already an instance of the winning AI pattern** — a scheduled autonomous agent that reads a data source and reports into the chat tool you already live in (the OpenClaw/Claude-cron/ChatGPT-tasks pattern). That's a tailwind for positioning and a concrete product direction (conversational drill-down), **not** a reason to expect venture-scale revenue.

**The single most important strategic move is Slack delivery**, because it's the only lever that meaningfully expands the *paying* market beyond the low-WTP Discord niche. Everything else is secondary.

---

## 1. Market sizing (bottoms-up, realistic)

### Don't say "TAM = all developers." Build it from the constraint chain.

Inky's reachable buyer must satisfy **all** of:
- has a **GitHub org** (not just a personal account),
- the team **already lives in Discord** (today's only delivery surface),
- has **enough activity** that a derived standup is useful (≥3 active contributors),
- **will pay** for team-process tooling (the hard filter for this segment).

**Anchor data (real):**
- GitHub: **4M+ organizations**, 180M+ developers ([GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)). Most orgs are tiny or dormant — "4M orgs" is not 4M teams.
- Discord: 150M+ MAU; **>30% of active users are in at least one tech server**; flagship dev servers are large (Reactiflux ~200k, The Coding Den ~148k, official Discord Developers ~284k) ([sources](https://www.instagantt.com/project-management/10-best-discord-servers-for-software-engineers), [Hive Index](https://thehiveindex.com/topics/software-development/platform/discord/)). But "developers hang out on Discord" ≠ "their company runs its standup on Discord."

### The funnel math (stated assumptions — tune these)

| Layer | Estimate | Reasoning |
|---|---|---|
| GitHub orgs, total | 4,000,000 | GitHub official |
| …that are *active multi-person teams* (≥3 contributors, recent activity) | ~3% → **~120,000** | Vast majority of orgs are solo/dormant/personal. This is a deliberately conservative cut. |
| …that run their **team comms on Discord** (not Slack) | ~8–12% → **~12,000** | Discord-as-workplace skews indie/OSS/gamedev/web3/AI. Most professional teams use Slack/Teams. This is the binding constraint. |
| **= SAM (Discord-native dev teams, today's product)** | **~10,000–15,000 teams** | The realistically reachable market *as the product exists now*. |
| **+ SAM if Slack ships** | **~80,000–120,000 teams** | Slack is where the *paying* dev teams are. This is the ~8–10× unlock. |

**SOM (what a solo maintainer can actually reach in 1–3 years):** distribution is organic (awesome-lists, r/selfhosted, Product Hunt, OSS word-of-mouth — per `distribution-kit.md`). A solo indie realistically touches **single-digit-thousands of installs over 2–3 years**, not tens of thousands.

### Free-adoption → paid funnel

| Stage | Year-1 (Discord-only) | Notes / source |
|---|---|---|
| Free self-host installs (cumulative) | **300–800** | Plausible for a well-marketed niche OSS dev tool, solo, part-time. Most "stars" never install; most installs churn. |
| Of those, teams that want **managed hosting** (don't want to run Render + PAT + keys) | ~15–25% | Self-host audience is *unusually* willing to self-host — this is lower than typical SaaS. |
| Hosted **trial** signups | **45–200** | |
| **Trial → paid conversion** | **5–8%** of installs convert to paid, OR ~25–35% of *trials* | Dev tools convert better than average (5–15% trial→paid; the evaluator is the user, no procurement) per [Userpilot](https://userpilot.com/blog/saas-average-conversion-rate/) / [First Page Sage](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/). But **open-core self-host depresses this**: the most capable teams just run it free. Net: stay at the low end. |
| **Paying accounts, end of Year 1** | **15–50** | |

### ARPA at a sane price point

Geekbot is **$3/user/mo** ($2.50 annual) ([Geekbot pricing](https://geekbot.com/pricing/)); Standuply premium starts ~$2/mo ([Standuply](https://standupbot.com/pricing/)). Inky should price **per-org flat with a contributor cap** (not per-seat — see §5), because the value scales with org activity, not headcount, and flat pricing is the right answer for a price-sensitive segment.

- **Plausible tiers:** ~$19/mo (small team, BYO LLM key) and ~$49/mo (managed key + roadmap/history/drill-down).
- **Blended ARPA ≈ $25–35/mo** in the base case (most accounts on the lower tier early; the premium tier pulls the average up only as the paywall feature matures).

---

## 2. Revenue estimate — how much, over what timespan, via what mechanism

**Mechanism:** Stripe subscriptions on the Phase 6 hosted multi-tenant tier (per-org flat + contributor cap). Free self-host = the funnel; managed hosting + premium features = the revenue. There is no other realistic revenue mechanism for this product (no per-seat enterprise motion, no usage-based infra play).

**Shared assumptions:** solo maintainer moving part-time → serious; monthly churn 4–6% (high for SMB/indie, realistic here); Slack ships in Year 2 (the inflection); one premium paywall feature (conversational drill-down or rich status-vs-plan) lands in Year 2.

| | **LOW** (it stays a side project) | **BASE** (honest expected) | **HIGH** (Slack + paywall both click) |
|---|---|---|---|
| **Y1 paying accts** | 8 | 25 | 60 |
| **Y1 ARPA** | $22 | $28 | $33 |
| **Y1 MRR (exit)** | **~$180** | **~$700** | **~$2,000** |
| **Y1 ARR** | ~$2k | ~$8k | ~$24k |
| **Y2 paying accts** | 20 | 90 | 250 |
| **Y2 ARPA** | $24 | $32 | $40 |
| **Y2 MRR (exit)** | **~$480** | **~$2,900** | **~$10,000** |
| **Y2 ARR** | ~$6k | ~$35k | ~$120k |
| **Y3 paying accts** | 35 | 180 | 550 |
| **Y3 ARPA** | $26 | $35 | $45 |
| **Y3 MRR (exit)** | **~$900** | **~$6,300** | **~$25,000** |
| **Y3 ARR** | ~$11k | ~$75k | ~$300k |

**Read the band honestly:**
- **BASE lands ~$6k MRR / ~$75k ARR by end of Year 3.** That's a real, nice part-time-to-modest-full-time income — *if* Slack ships and one premium feature converts. It is **not** venture scale and won't be.
- **LOW is the gravity well.** If the maintainer stays Discord-only and never builds the dashboard/billing, this asymptotes to a beloved-but-unmonetized OSS repo at **~$1k MRR or less** — a portfolio piece, not a business. This is the *most likely* outcome if Phase 6 stalls, and it must be named.
- **HIGH (~$25k MRR) requires** Slack delivery working, a paywall feature people pull out a card for, and sustained distribution effort. Possible, not probable. Treat it as the stretch, not the plan.

**Blunt verdict on dollars:** the expected case is a **$3–8k/mo lifestyle SaaS within ~2–3 years**, with a realistic ceiling near **$10–25k/mo** only if Slack lands. Plan the next 6 months around the BASE case, not the HIGH one.

---

## 3. Inky and the scheduled-autonomous-agent trend

**"openclaw" is confirmed.** [OpenClaw](https://docs.openclaw.ai/automation/cron-jobs) is a CLI platform for Claude whose headline feature is a **cron scheduler that "persists jobs, wakes the agent at the right time, and delivers output back to a chat channel or webhook"** — Slack, Discord, Telegram, Matrix — with an explicit **"agent as employee"** framing ([DEV writeup](https://dev.to/hex_agent/openclaw-cron-jobs-automate-your-ai-agents-daily-tasks-4dpi)). This is the same shape as Claude Code's scheduled agents and ChatGPT tasks: **a set-and-forget agent that does work on a schedule and reports back into the tool you already use.**

**The thesis holds: Inky is already a productionized instance of the winning pattern.** It's a scheduled autonomous agent (croner worker) that reads a data source (GitHub) and reports into the chat tool the team lives in (Discord). Most "cron-agent" demos are generic and unopinionated. Inky's edge is that it is **vertically specialized, grounded, and trustworthy** for one job — and the hard parts (identity aliasing, LOC noise filtering, no-hallucination grounding discipline, PR-size/cycle-time stats) are exactly what a generic OpenClaw cron job *won't* get right out of the box.

**Concrete product implications (positioning + build):**
1. **Position Inky explicitly as a scheduled-agent product, not "a Discord bot."** The category is forming right now; claim "the standup agent" inside it. Update the README hero and the Product Hunt copy to ride this language ("a scheduled AI teammate that reads your repo and writes the standup").
2. **The trend's risk is also the opportunity.** A generic cron-agent platform *could* be told "summarize our GitHub activity each morning." Inky's moat against that is **grounded quality + zero-config correctness**, not feature count. Lean into the grounding discipline as the differentiator — that's the thing a one-shot prompt to a generic agent reproduces badly.
3. **The trend points directly at the next feature: conversational drill-down** (`/ask Inky` — already in the backlog). The pattern isn't just "report on a schedule," it's "report on a schedule *and let me interrogate it*." That's the natural premium surface (see §4) and it keeps Inky on-trend without drifting into general-assistant territory.

---

## 4. Vertical & horizontal expansion (scoped — stay in the lane)

**Guardrail honored:** every option below stays inside "team-activity intelligence derived from dev tools, delivered in-chat." Nothing here drifts toward a general personal assistant.

### Vertical (deeper in the same wedge)

| Bet | Effort | Revenue leverage | Verdict |
|---|---|---|---|
| **Conversational drill-down** (`/ask Inky about the work`) | Med (one-shot `/ask`) → High (agentic thread) | **High** — this is the "pull out a card" feature; on-trend; hard to replicate with a generic prompt because of grounding | **Sequence it.** Start with one-shot `/ask` as the testable premium MVP. |
| **Richer status-vs-plan** (Linear/Jira/Notion/Projects v2) | High (OAuth surface) | **High** — "status vs the tracker we actually use" is the original paid thesis | **Sequence the Linear BYO-key adapter** (no OAuth) as the cheap proof. |
| **Manager-private DM digests / ephemeral stats** | Low (ephemeral) → Med (true DM) | Med — strong trust/retention, weak standalone WTP | Ship ephemeral now (cheap); DM later. |
| **Trends/charts/history** | Med (needs Postgres history) | Med — retention + dashboard value, not a standalone paywall | Rides Phase 6 infra; don't build standalone. |
| **Retrospective/eval reports** (the `team-perf` sibling) | Med | Low–Med, and **carries surveillance-perception risk** (plan §8) | Defer. Don't let Inky read as a performance-ranking tool. |

### Horizontal (adjacent surfaces/sources, same core)

| Bet | Effort | Revenue leverage | Verdict |
|---|---|---|---|
| **Slack delivery** | **Med-High** (new delivery adapter + Slack app/OAuth) | **Highest of anything here** — ~8–10× the *paying* SAM (§1) | **#1 priority.** This is the only lever that escapes the low-WTP Discord niche. |
| **Linear/Jira as a data *source*** (not just reconcile) | High | Med — broadens "activity" beyond commits | After Slack + drill-down. |
| **Other cadences** (sprint reports, release notes, exec summaries) | Low-Med (mostly prompt/window work, core already scales depth) | Med — cheap surface-area expansion, good for premium tiering | Cheap follow-on; bundle into premium. |

### The 2–3 bets to actually sequence next

1. **Slack delivery (horizontal).** Without it, the paying market is the small, price-sensitive Discord niche and revenue caps in the LOW/BASE band. With it, the BASE/HIGH band opens. **This is the single highest-leverage build.** Highest effort of the three, but it's the market unlock.
2. **Conversational drill-down — one-shot `/ask` (vertical).** The differentiated, on-trend premium hook. Buildable on the current bot, grounded by the existing discipline. This is the feature that makes a manager pull out a card. Start one-shot; go agentic only if it converts.
3. **Linear BYO-key reconcile source (vertical).** Cheap proof of the original paid thesis ("status vs the plan you actually use") without the OAuth tax. Validates demand before the full hosted OAuth build.

**Everything else waits.** Charts, DM, exec summaries, Jira-as-source are all "as users pull it," not now.

---

## 5. Monetization strategy specifics

### Pricing structure: **per-org flat, with a contributor cap.** Not per-seat.
- **Why not per-seat:** the segment is price-sensitive and the value scales with *org activity*, not headcount. Per-seat ($3/user like Geekbot) punishes exactly the active OSS/indie teams Inky attracts and invites self-hosting.
- **Shape:** e.g. **Free self-host (forever)** → **Hosted Starter ~$19/mo** (BYO LLM key, up to ~10 contributors, daily+weekly, status-vs-plan) → **Hosted Pro ~$49/mo** (managed LLM key, ~25 contributors, history/trends/charts, **conversational `/ask`**, private DM digests) → custom above the cap.

### Free vs paid line
- **Free (self-host, MIT):** the entire core pipeline — collect/normalize/reconcile/summarize/render, Discord delivery, `/standup`, GitHub App auth, milestone + ROADMAP.md status. This is the funnel and must stay generous.
- **Paid (hosted only):** **managed hosting** (no Render/PAT/keys), **editable settings via dashboard**, **stored history → trends/charts**, **conversational drill-down**, **Slack delivery**, **managed LLM key**, **Linear/Jira/Notion OAuth sources**.

### The actual paywall — what makes a team pull out a card
Not "managed hosting" alone (the self-host crowd shrugs at it). The card comes out for **one of two things**:
1. **"I don't want to run infrastructure"** — the convenience tier (managed keys + dashboard + Slack). This converts the *non*-self-hosters, which is most of the Slack market.
2. **"Ask my codebase what my team actually did this week"** — conversational drill-down + private manager DM. This is the *value* paywall, the differentiated one, the reason a manager pays beyond convenience.

**Build #2 as the headline paid feature.** Convenience tiers are commoditized; the grounded Q&A agent over org activity is the thing that's genuinely hard to reproduce and worth a card.

### BYO-key vs managed-key tiering
- **BYO-key = cheaper tier** (Starter): customer brings Anthropic/Groq/OpenAI key; Inky's COGS ≈ hosting only. Lower friction on cost-to-serve, more friction on setup.
- **Managed-key = premium tier** (Pro): Inky's key, **metered + capped per tenant** (the `runs.llm_tokens` column already exists for this). Price the LLM cost in with margin. Best UX, defensible.
- Offer **both** — BYO for the cost-conscious self-host-adjacent buyer, managed for the "just make it work" buyer.

### Open-core risk and the defense
**The risk is real and structural:** the entire core is MIT. A capable team self-hosts everything for free, forever. In the Discord-native segment specifically, that's the *modal* user. This is why the LOW case has gravity.

**What actually defends the paid tier (in order of strength):**
1. **Slack at multi-workspace scale** — genuinely annoying to self-host (Slack app distribution, OAuth, per-workspace tokens). The hosted tier owns this.
2. **Managed multi-tenant infra + dashboard + billing** — the `apps/dashboard`/`apps/worker` packages are deliberately *not* MIT (license TBD per phase6-design.md). Keep them source-available-or-private. Editable-settings-via-UI is a feature you can't `git clone`.
3. **Conversational drill-down at quality** — the *prompt* is reproducible, but the grounded tool-forced pipeline + the managed key + the history substrate make the hosted version meaningfully better than a weekend self-host.
4. **Managed LLM keys + history** — convenience that compounds.

**Honest caveat:** none of these *fully* stops a determined team from self-hosting the free standup. They don't need to. The bet is that the teams who'll *pay* are the ones who value not-running-infra — and that population is overwhelmingly in **Slack**, which is why §4 bet #1 is Slack.

---

## 6. Pricing, competitors, marketing & GTM (the documented plan)

### 6.1 Pricing

**Structure:** open-core. Free self-host forever (the funnel) + a hosted SaaS with **per-org flat tiers gated by a contributor cap** — never per-seat. The value scales with org activity, not headcount, and flat pricing is the right answer for a price-sensitive, self-host-capable segment.

| Tier | Price | Contributor cap | LLM key | What's included |
|---|---|---|---|---|
| **Self-host** | Free (MIT) | unlimited | BYO | Full core pipeline, Discord delivery, `/standup`, GitHub App auth, milestone + `ROADMAP.md` status. The funnel. |
| **Starter (hosted)** | **$19/mo** ($190/yr, ~2 mo free) | up to ~10 | BYO | Managed hosting (no Render/PAT/keys), dashboard-editable settings, daily+weekly schedules, status-vs-plan, **Slack OR Discord delivery**. |
| **Pro (hosted)** | **$49/mo** ($490/yr) | up to ~25 | **Managed** (metered + capped) | Everything in Starter + **conversational `/ask`**, private manager DM digests, history/trends/charts, Linear/Jira/Notion OAuth sources, multi-channel delivery. |
| **Scale** | custom (~$99+/mo) | 25+ | Managed | Higher caps, priority support, SSO later. Hand-sold. |

**Why these numbers.** Geekbot is $3/user/mo, so a 10-dev team pays ~$30/mo *and still has to type their updates*. Inky **Starter at $19 flat undercuts that and removes the typing**; **Pro at $49** is competitive with a 15-seat Geekbot while delivering the differentiated value (derived + interrogable + status-vs-plan). Both sit an order of magnitude below engineering-analytics tools ($20–40+/dev/mo), which is deliberate — Inky is the cheap, lightweight, team-facing option, not an analytics platform.

- **Contributor cap = active contributors in the billing period** (people who appear in the activity window), not org membership — so a 40-person org with 8 active committers pays Starter, which is fair and self-selects upgrades as activity grows.
- **Annual = ~2 months free** (standard SaaS lever; improves cash + reduces churn).
- **The card comes out for one of two reasons** (see §5): "I don't want to run infra" (convenience → Starter) or "let me ask my codebase what the team did" (value → Pro). Price the **`/ask` + private DM** bundle as the Pro anchor; that's the differentiated paywall.

### 6.2 Competitors (full landscape + where Inky wins)

Builds on plan §2. Four categories plus an emerging one:

| Category | Players | Model & price | Why they don't close Inky's gap |
|---|---|---|---|
| **Async standup bots** | Geekbot, DailyBot, Standuply | DM humans, collect typed answers. ~$2–4/user/mo | **Human-input driven.** The whole point of Inky is they make people type; Inky derives it. Direct positioning target. |
| **Raw event firehose** | Native GitHub→Discord / GitHub→Slack webhooks | "X pushed to main." Free | **Noisy, unsummarized, per-event.** Inky is one digested, AI-written narrative per day — the opposite of a firehose. |
| **Engineering analytics** | LinearB, Swarmia, Haystack, Jellyfish | Deep Git analysis, DORA, manager dashboards. **$20–40+/dev/mo** | **Enterprise-priced, heavy, manager-facing, surveillance-adjacent.** Inky is cheap, lightweight, team-facing, in-chat, OSS-first. Different buyer. |
| **Generic cron-agent platforms (emerging)** | OpenClaw, n8n + LLM nodes, Zapier AI, Claude/ChatGPT scheduled tasks | DIY: wire a prompt to a schedule + a webhook. Usage/seat priced | **Ungrounded & zero-config-wrong.** They *can* be told "summarize our GitHub each morning," but you get hallucination, no identity aliasing, no LOC noise filtering, no PR-size/cycle-time stats. Inky is the productized, grounded vertical. This is the real long-run competitive pressure — answer it with **quality + zero-config correctness**, not feature count. |

**One-line positioning:** *the zero-input, GitHub-derived, AI-written daily standup delivered into the chat tool your team already lives in — grounded, cheap, and self-hostable.* No incumbent owns that sentence.

**Comparison pages to publish (SEO + sales):** "Inky vs Geekbot," "Inky vs a GitHub→Discord webhook," "Inky vs building it yourself with [cron-agent]." Each maps a competitor's category weakness to Inky's wedge.

### 6.3 Marketing

**Engine: product-led + OSS distribution.** No paid ads, no sales team — the free tool *is* the marketing, and every posted standup carries the 🐙 footer (organic reach into exactly the channels where buyers are).

- **Launch channels (one-time spikes):** Show HN ("Show HN: Inky — your standup, derived from GitHub, not typed"), Product Hunt, r/selfhosted, r/devops, r/opensource. Re-launch on Product Hunt when **Slack ships** (a legitimate second moment).
- **Always-on discovery:** submit to `awesome-selfhosted` / `awesome-discord` / `awesome-devtools`; optimize the GitHub repo (topics, README hero, demo GIF) for GitHub search; a `inky` GitHub topic.
- **Content (SEO + credibility):** the cornerstone essay *"Standups should be derived, not solicited"*; the comparison pages (§6.2); a short "how the grounding discipline works" technical post (differentiates vs generic cron-agents). Host on dev.to + a simple blog.
- **Community presence:** be a real participant in the Discord dev servers where the beachhead lives (gamedev, indie, web3, AI tooling). Not spam — answer "how do you do standups" threads.
- **Build-in-public:** X/Bluesky thread cadence on shipping Slack, `/ask`, etc. The "scheduled AI teammate" framing (§3) rides the current agent-tooling wave.
- **The viral surface is the product itself:** the standup footer + "hosted by Inky" CTA in the dashboard convert free self-host viewers into hosted leads at zero CAC.

### 6.4 Go-to-market

**Motion:** bottoms-up, product-led, OSS-funnel. A developer self-hosts it free → their team sees value daily → when they tire of running infra (or want `/ask`/Slack/status-vs-plan), they convert to hosted. No outbound, no demos, no procurement.

- **Beachhead:** Discord-native dev teams (indie / OSS / gamedev / web3 / AI tooling) — the segment that already lives in Discord and will try a free MIT repo. Land here first.
- **Expansion:** **Slack delivery is the GTM unlock** — it opens the ~8–10× larger pool of GitHub-org teams on Slack (the ones who actually pay). Sequence Slack as the bridge from beachhead to the real market.
- **Land → expand:** free standup *lands*; **managed hosting + `/ask` + status-vs-plan** *expand* to paid. The free tier must stay generous (it's the funnel) — paywall *convenience* and *differentiated depth*, never the core standup.
- **Design partners:** hand-hold the first 2–3 teams onto hosted (free/discounted) in exchange for testimonials + feature validation. Their "host it for us" request is the green light to finish the dashboard/billing (don't build it before that pull).
- **Instrument the funnel (prerequisite — currently zero telemetry):** opt-in install pings, active-worker count, `/standup` + `/ask` usage, "host for us" CTA clicks, trial→paid, churn. You can't manage a funnel you can't see.
- **Sequence:** distribution kit + Show HN/PH → comparison-page SEO → design partners → ship Slack → second PH launch → turn on self-serve billing.

---

## 7. If I were you: the next 6 months

**Goal: get from "live OSS repo" to "first dollars + proof the paywall converts" — and find out whether this is LOW or BASE.**

1. **Months 0–1 — Distribution + measurement (cheap, compounding).** Execute `distribution-kit.md`: awesome-selfhosted, r/selfhosted, Product Hunt, the "why" post. **Add lightweight telemetry/opt-in install pings** — you cannot manage a funnel you can't see. *Right now you have zero usage data; every number in this memo is an assumption until you instrument.* Reposition the README around the **scheduled-agent** category.
2. **Months 1–3 — Conversational `/ask` (one-shot), self-host.** Ship the differentiated, on-trend premium hook into the free tool first to prove people *want* it (high `/ask` usage = green light to paywall it hosted). Add the **ephemeral private reply** (cheap manager-trust win). Ship the **Linear BYO-key reconcile source** to test the "status vs the plan you use" demand.
3. **Months 3–6 — Phase 6 minimum monetization, gated on pull.** Only when 2–3 teams say "host it for us": build the **dashboard MVP → multi-tenant worker → Stripe billing** (the `packages/db` foundation is already done). **Bundle Slack delivery into this build** — it's the market unlock and it rides the same hosted infra. First paid accounts here.

**Plausible revenue by end of this 6 months:** **~$300–1,500 MRR** (a handful to ~20 paying accounts). That's not the prize — the prize is the **signal**: does `/ask` get used, do teams ask to be hosted, does Slack pull demand. Those three answers tell you whether to go full-time (BASE/HIGH) or keep it a beloved side project (LOW).

**The one trap to avoid:** building the full SaaS before there's pull. The infra is half-built and seductive. Don't finish the dashboard/billing until real teams ask to pay. Lead with distribution + the `/ask` hook; let demand pull the SaaS.

---

## Honest verdict

**Inky is a lifestyle/indie SaaS, not a venture business.** Realistic expected outcome: **~$3–8k MRR within 2–3 years** (BASE), with a stretch ceiling near **$10–25k MRR** if and only if Slack delivery ships and the conversational-drill-down paywall converts. The product is good; the market is small and self-host-prone. Slack is the one lever that changes the math. Build the `/ask` hook to differentiate, ship Slack to expand the paying market, and let demand — not the seductive half-built dashboard — decide when to go all-in.

---

## Sources

- [OpenClaw — Scheduled tasks / cron](https://docs.openclaw.ai/automation/cron-jobs) · [OpenClaw cron jobs (DEV)](https://dev.to/hex_agent/openclaw-cron-jobs-automate-your-ai-agents-daily-tasks-4dpi)
- [Geekbot pricing](https://geekbot.com/pricing/) · [Geekbot cost (Help Center)](https://help.geekbot.com/en/articles/4280827-how-much-does-geekbot-cost) · [Standuply/StandupBot pricing](https://standupbot.com/pricing/)
- [GitHub Octoverse 2025 (orgs/devs)](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- [Best dev Discord servers / community sizes](https://www.instagantt.com/project-management/10-best-discord-servers-for-software-engineers) · [Hive Index — dev Discord servers](https://thehiveindex.com/topics/software-development/platform/discord/)
- [Userpilot — SaaS conversion benchmarks](https://userpilot.com/blog/saas-average-conversion-rate/) · [First Page Sage — freemium conversion](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/) · [ChartMogul — free-to-paid report](https://chartmogul.com/reports/saas-conversion-report/)
