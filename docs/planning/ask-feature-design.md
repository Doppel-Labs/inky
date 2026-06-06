---
created: 2026-06-06
status: active
author: Claude main session
branch: main
informed_by: docs/planning/roadmap-and-phase-6.md (Track B backlog "conversational drill-down" + Next bets #2); docs/planning/inky-market-and-growth-strategy.md §4 (the differentiated paywall); packages/core/src/summarize.ts (the grounding-digest + forced-tool discipline this reuses); packages/core/src/telemetry.ts (ask_run is already stubbed to measure adoption)
notes: Design + scope for one-shot `/ask` — a grounded Q&A over the org's GitHub activity. The MVP (tier 1) and the honest line on what it can and can't answer, plus the path to the agentic tier.
---

# Inky — `/ask` (conversational drill-down), design

## Why this, why now
The strategy memo names conversational drill-down **the differentiated paywall** —
"ask your codebase what your team actually did" — and the sequenced plan is to
**ship one-shot `/ask` into the free tool first** to prove demand before paywalling
it. Telemetry already reserves the `ask_run` event so adoption is measurable from
day one (heavy `/ask` use = the green light to gate it on the hosted tier).

The moat vs. a generic cron-agent ("summarize our GitHub") is the **same grounding
discipline as the standup**: answer only from verified, fetched facts; never invent.

## MVP scope — tier 1: one-shot, context-stuffed
`/ask <question>` (and `inky ask "<question>"`) answers a single question about a
time window, in one model call, with no conversation state. It is a thin sibling
of `buildStandup`:

1. **collect()** the window's activity (reuse the existing pipeline verbatim).
2. **buildGroundingDigest()** — the *same* factual digest the standup grounds on
   (reused from `summarize.ts`), but with higher commit/PR caps so specific
   questions have raw material.
3. **One forced tool call** (`answer`) over that digest, under a grounding system
   prompt: answer ONLY from the digest; if it isn't there, say so and set
   `grounded:false`. No speculation, no general knowledge, aggregates only from
   the verified "Org totals".
4. **Render** the answer to Discord markdown (question + window header, the answer,
   the grounded footer) and deliver via the existing embed path.

This is buildable on the current bot, self-host-able, BYO-key — exactly the
"testable today against your live bot" property the strategy wants.

### Why context-stuffing, not an agent (for the MVP)
The whole window's activity already fits the model's context (the standup stuffs
the same digest every day). So tier 1 needs **no tools, no iteration, no new
fetching** — it reuses 100% of the collect→digest path and adds only a prompt + a
tool schema. Smallest possible diff, same grounding guarantees.

## The honest limits (tier 1)
The digest contains what the standup shows: commits (message/repo/branch/shipped),
PRs (number/title/repo/state), reviews, issues, and verified org totals. So `/ask`
can answer:
- "What did `alice` ship this week?" / "What's still in flight on `api`?"
- "Who reviewed the auth PR?" / "How many PRs merged this week?"
- "What landed that wasn't on the roadmap?" (when roadmap is on)

It **cannot** answer, and by design will *say so* rather than guess:
- "**Why** did PR #42 take so long?" — the digest has no diffs, no review latency,
  no comment threads. (Cycle-time medians exist team-wide in stats, not per-PR here.)
- Anything **outside the window**, or requiring code-content reasoning.

That refusal *is* the feature working — grounded-or-silent beats plausible-but-wrong.
Surfacing the limit (`grounded:false`) also tells us which questions users actually
want, which is the signal that justifies tier 2.

## Future tiers (not now)
- **Tier 2 — agentic thread.** Give the model tools to fetch on demand (PR diffs,
  review timelines, file history) and iterate, holding the same emit/grounding
  discipline. Answers the "why" questions. Heavier; gate on tier-1 demand.
- **Tier 3 — dashboard chat** over stored history (Phase 6 Postgres), beyond a
  single window.

## Surfaces & contract
- **CLI:** `inky ask "<question>" [--days N | --hours N | --since/--until] [--dry-run]`.
- **Slash:** `/ask question:<text> [range:Today|This week|This month] [days:N] [private:true]`.
  Admin-only by default (same as `/standup` — it exposes private org activity);
  `private:true` → ephemeral, so a manager can interrogate privately.
- **No LLM key →** `/ask` errors clearly (no mechanical fallback — it's inherently
  an LLM feature, unlike the standup).
- **Empty window →** a grounded "no activity in this window" answer with no model
  call (saves a token, still honest).
- **Telemetry:** fire `ask_run { trigger, windowHours, grounded, private }` (scalar
  only, no question text — never send the question or any content).

## Privacy note
The question text and the answer are **never** sent to telemetry — only the scalar
`ask_run` counts. Same discipline as everywhere else: counts, not content.
