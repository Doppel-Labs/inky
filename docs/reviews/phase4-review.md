---
created: 2026-06-01
status: active
author: code-reviewer agent (triaged by Claude main session)
session: aa8bf74f-adef-4f15-a54b-4d2aa9d20e9e
branch: main
informed_by: Code review of the Phase 4 additions (worker.ts, bot.ts, commands.ts, standup.ts, cli.ts serve/register-commands); full report was in docs/temp/phase4-review.md (deleted after triage)
notes: Triaged checklist of the Phase 4 review. Code findings landed in commit after the review; OSS-prep items remain open for the user before the first public push.
---

# Phase 4 review — triaged checklist

Reviewer ran a full pass over the Phase 4 additions (correctness, security,
lifecycle, OSS-readiness). Code findings are fixed; the remaining open items are
**user actions before open-sourcing / going live**. The reviewer also confirmed
the core (worker tick isolation, defer→respond ordering, embed chunking, grounded
summarizer, graceful shutdown) is solid.

## Landed (code fixes)

- [x] **H-1** — bot's fire-and-forget interaction handler could crash the process on an unhandled rejection. Wrapped the `interactionCreate` handler in bot.ts and guarded `respondError` in `handleStandupCommand`.
- [x] **H-2** — `/standup` had no access control. Added `setDefaultMemberPermissions('0')` (admin-only by default; broaden via Discord per-command perms). Documented in `discord-bot-setup.md`.
- [x] **M-1** — an issue opened **and** closed in the same window dropped the close. `fetchIssues` now emits one record per action so opened/closed counts stay accurate.
- [x] **M-2** — a mid-delivery `followUp` failure could post "couldn't build the standup" on top of an already-delivered standup. Follow-up batches are now caught per-batch and logged.
- [x] **M-3** — raw LLM/GitHub error bodies were sent verbatim to the channel. The channel-facing error is now single-lined and truncated to 200 chars; the full message stays in logs.
- [x] **M-4** — `SchedulerFactory` advertised a `protect` option that `cronScheduler` ignored. Removed it from the type/call site (overlap protection is always on).
- [x] **L-3** — `serve --once` runs only the scheduled cycle, not the bot. Clarified in the CLI help text.
- [x] **N-2** — `EMBEDS_PER_MESSAGE` was duplicated. Exported from `discord.ts`, imported in `bot.ts`.

## Considered, intentionally not changed

- [x] **L-1** — reviewer suggested `unref: true` on the croner job. **Rejected:** an unsettled `Promise` does not keep Node's event loop alive, so the (unref'd-false) croner timer is exactly what holds a scheduler-only `serve` process open. `unref: true` would make it exit immediately. Current behavior is correct.
- [x] **L-2 / N-1 / N-3** — trailing-newline nit (render funcs guarantee `\n`), `statusVsPlan` forward-compat (intentional for Phase 5), and the defensive `days` clamp (Discord enforces 1–90; the clamp covers the CLI/direct path). No change.

## Open — user actions before the first public push

- [x] **OSS-1 (blocker) — RESOLVED 2026-06-03.** Git history was rewritten with `git filter-repo` (no squash — all 37 commits preserved) to scrub the real contributor logins and the personal machine email that lived in early `src/identity.test.ts` content (mapped to the generic `alice-work`/`bob-work`/`carol-work` fixtures). A full-history re-scan is clean; the org name `Doppel-Labs` (the host org) was kept on purpose. Old history is backed up at `../inky-history-backup.bundle`.
- [ ] **OSS-2** — local (gitignored) `inky.config.json` holds the real org + aliases. Not committed (won't push), but replace it with the example content or delete it before publishing the checkout.
- [ ] **OSS-3** — local (gitignored) `.env` holds live `ANTHROPIC_API_KEY` / `GROQ_API_KEY` (and now `DISCORD_WEBHOOK_URL`). Never committed, but rotate the keys before any public announcement (cheap insurance).
