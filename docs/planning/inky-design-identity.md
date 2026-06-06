---
created: 2026-06-05
status: active
author: elite-ui-designer agent
branch: main
informed_by: live Gitmore (gitmore.io) competitor scan in .playwright-mcp/ (gitmore-01-hero.png, gitmore-05-ask-ai.png — cream/espresso/gold warm-editorial language); multi-source-harness-strategy.md (the many-sources-one-brain octopus thesis, the four-quadrant on-track/at-risk/untracked model, grounding discipline); inky-market-and-growth-strategy.md §6 (positioning, OSS/PLG funnel, the 🐙 standup footer as the viral surface); inky-ambitious-strategy.md (intention-vs-execution wedge)
notes: Visual identity + design direction for Inky (live OSS product going multi-source/hosted SaaS). Three named directions, a recommendation with tokens, the octopus mascot stance, voice/copy guide, and ASCII mockups for the marketing hero + a standup/dashboard card. Goal — match Gitmore's craft level (editorial type, framed shots, confident restraint) but with a deliberately divergent ink/deep-sea palette and a grounded, calm, anti-hype soul. No code build; this is the written direction the eventual site + dashboard implement.
---

# Inky — Visual Identity & Design Direction

> **The brief in one line:** match Gitmore's craft (editorial type, framed product shots, confident voice, whitespace, restraint) — and look *nothing* like it. Gitmore is **beige/warm/earthy**. Inky is **ink/deep-sea**: deep, calm, trustworthy, a little magical. The aesthetic must signal *grounded reporting*, never *generic-AI slop*.

---

## 0. What we're differentiating against (the Gitmore read)

From the live scan, what makes Gitmore look premium — and therefore what we must hit *at the same level but differently*:

| Gitmore move | Why it works | Inky's counter-move |
|---|---|---|
| Warm **cream `#F6F1E7`** canvas | Calm, anti-SaaS, "paper" | Keep the calm; go **deep, not warm** — ink-dark or cool-paper, never beige |
| **Espresso-brown** buttons, single **amber/gold** accent | Restraint; one accent reads as taste | Same one-accent discipline; ours is **luminous/bioluminescent**, not earthy |
| **Serif display + italic emphasis word** ("it's that *simple*", "your *codebase*") | Editorial, human, premium | Steal the *structure* (serif display, one italic accent word) — different typeface so it doesn't read as a clone |
| Product shots in **rounded cards w/ soft amber glow** | Frames the screenshot as a hero object | Frame ours in **deep-sea cards with a cool aqua/cyan glow** + a hairline edge |
| Casual-snark copy ("No YAML hell," "we're not pushy about it") | Likeable, founder-voice | **Diverge here too** — Inky is *calm and plain-spoken*, not snarky. Trust > banter |
| Topographic **contour texture** in hero | Subtle craft, depth | Ours: **depth gradient / faint sonar-contour / ink-diffusion** — same "earned texture," reads as deep water not terrain |

**The trap to avoid:** "beige Gitmore." If a stranger squints and can't tell the two sites apart by palette alone, we've failed.

---

## 1. Three design directions

### Direction A — "Abyssal" (bioluminescent deep-sea) ⭐ leading candidate

**Emotional positioning:** *Calm depth.* You're looking into deep, still water and a single light glows up from below — the one true signal. Trustworthy, quiet, a little magical. The opposite of a frantic dashboard.

**Palette**
| Role | Hex | Note |
|---|---|---|
| Canvas (bg) | `#0A1420` | abyssal ink-navy, near-black but blue |
| Surface | `#121F30` | raised card |
| Surface-2 | `#1A2C42` | hover / nested |
| Text | `#EAF2F8` | cool off-white, not pure white |
| Muted | `#8AA0B4` | secondary, captions |
| Hairline | `#23384F` | 1px borders, dividers |
| **Accent (bioluminescent)** | `#3DE0D2` | aqua-cyan glow — the one light |
| Accent-deep | `#1A8C8C` | accent pressed / gradient end |

**Type pairing:** Display = **Fraunces** (open-source, Google Fonts) — a soft, optical serif with a real italic; use it for headings *with one italic emphasis word* (the Gitmore move, different face). Body/UI = **Inter** or **Geist Sans**. Numerals/code/data = **Geist Mono** or **JetBrains Mono** (grounds the "this is verified data" feel).

**Texture/motif:** depth gradient (darker at edges, faint glow rising from the lower-center), a *very* subtle sonar/contour ring behind the hero product shot, and **ink-diffusion** as the signature loading/transition (ink blooming into water). Octopus appears as a calm line mark, not a cartoon.

**Product shots:** framed in deep `#121F30` cards, hairline `#23384F` border, soft **cyan** outer glow (cool sibling of Gitmore's amber glow), 16px radius.

**Diverges from Gitmore by:** inverting the whole value — dark + cool + luminous vs light + warm + earthy. **Fits Inky** because deep still water = grounded, calm, trustworthy; the single rising light = "the one verified signal in the noise."

---

### Direction B — "Inkwell" (editorial-noir, light-mode)

**Emotional positioning:** *The quiet broadsheet.* Inky as a meticulous editor who files a clean report every morning. Cool paper, ink-black type, one squid-ink accent. More "newspaper of record" than "deep sea."

**Palette**
| Role | Hex | Note |
|---|---|---|
| Canvas | `#F4F6F8` | cool paper (NOT cream — the deliberate anti-Gitmore) |
| Surface | `#FFFFFF` | card |
| Text | `#0E1726` | ink-black |
| Muted | `#5A6B7E` | secondary |
| Hairline | `#DCE3EA` | borders |
| **Accent (squid-ink)** | `#5B3FD6` → support `#6D4AFF` | ink-purple, a touch magical |
| Accent-cool | `#127C8C` | optional teal for data |

**Type pairing:** Display = **Newsreader** or **Fraunces** (editorial serif, italic emphasis word). Body = **Inter**. Data = **JetBrains Mono**. Leans hardest into the serif-italic move.

**Texture/motif:** restrained — a single ink-diffusion bloom behind the wordmark, otherwise generous whitespace and rules/hairlines like a print layout. Octopus is a tiny inked stamp/colophon mark.

**Product shots:** white cards, crisp hairline, *very* soft purple-grey shadow (no glow) — editorial, not glowy.

**Diverges from Gitmore by:** it's also light-mode, so it must win on **cool-vs-warm** and **purple-vs-gold**. Riskier (closest in structure to Gitmore) but a clean "report" identity. **Fits Inky** because the broadsheet metaphor *is* grounded reporting. Weakness: shares the light-editorial lane with the competitor — less differentiation at a glance.

---

### Direction C — "Many Arms" (the octopus systems-diagram direction)

**Emotional positioning:** *One calm brain, many reaching arms.* Leans all the way into the multi-source thesis (GitHub/Linear/Notion/Granola → one synthesizing brain). More "infrastructure / connected-intelligence" than "deep water." Confident, architectural, a little sci-fi.

**Palette:** Abyssal base (`#0A1420`/`#121F30`) but with **two accents**: cyan `#3DE0D2` for the synthesis/brain and a warm coral `#FF7A66` *only* on the at-risk semantic — so the "arms reaching into sources" can be color-coded per source. Risk: two accents dilutes the one-accent restraint that reads as taste.

**Type pairing:** Geometric display = **Space Grotesk** + Inter body + mono for data. Less editorial, more product/technical. Drops the serif-italic move (a real divergence from Gitmore — but also drops some of the "premium editorial" we're told to match).

**Texture/motif:** the hero is a literal-but-elegant **node graph** — source logos on the perimeter, faint animated tendrils converging into a central Inky brain that emits the standup. The octopus is structural, not decorative.

**Product shots:** framed as nodes in the diagram, or in flat dark cards with a thin cyan edge.

**Diverges from Gitmore by:** completely different *concept* (systems diagram vs editorial landing), not just palette. **Fits Inky's** platform ambition hard. Weakness: "connected sources" node-graphs are a *generic-AI/dev-tool cliché* — exactly the slop aesthetic the audience is allergic to. Best used as a **section** inside A, not the whole identity.

---

## 2. Recommendation → **Direction A "Abyssal"**, with B's editorial discipline and C's metaphor as accents

**Pick A.** It wins on every axis of the brief:

- **Hardest divergence from the warm-editorial competitor set.** Dark + cool + luminous is the maximum-distance inversion of cream + warm + gold. Nobody confuses the two sites.
- **Best signals "grounded + trustworthy + a little magical."** Deep, *still* water = calm and grounded; the single rising bioluminescent light = the one verified signal Inky surfaces where generic agents hallucinate. The magic is *restrained* (one glow), which is exactly the anti-slop posture.
- **Owns the name.** Inky / ink / deep sea / octopus — the identity *is* the brand story; no translation needed.
- **Dashboard-native.** A dark, calm surface is where engineers already live (their editor, their terminal); a status dashboard reads better dark, and the semantic states (cyan on-track / amber at-risk / slate untracked) pop cleanly against ink.

**But borrow:**
- from **B**, the *editorial serif-italic display* (Fraunces) and print-grade whitespace/hairlines — so Abyssal reads premium-editorial, not "another dark dev-tool SaaS."
- from **C**, the *many-arms* metaphor — as ONE marketing section (the connected-sources story) and as the mascot logic, **not** the whole visual system.

Net identity: **calm editorial deep-sea.** Gitmore's craft level and editorial restraint, inverted into ink.

---

## 3. Core tokens — "Abyssal" (the recommended system)

### Palette (with the calm semantic set the product needs)

```
/* base */
--bg:          #0A1420;   /* abyssal canvas */
--surface:     #121F30;   /* card */
--surface-2:   #1A2C42;   /* nested / hover */
--hairline:    #23384F;   /* 1px borders, dividers */
--text:        #EAF2F8;   /* primary */
--muted:       #8AA0B4;   /* secondary, captions, timestamps */
--faint:       #5C7388;   /* tertiary */

/* accent — the one light */
--accent:      #3DE0D2;   /* bioluminescent aqua-cyan */
--accent-deep: #1A8C8C;   /* pressed / gradient end */
--accent-glow: rgba(61,224,210,0.18);  /* card glow, focus ring */

/* semantic status — calm, never alarmist (on-track / at-risk / untracked) */
--ok:        #3DE0D2;   /* on-track — uses the accent itself: "good" == "the signal" */
--at-risk:   #F2B45C;   /* at-risk — warm amber, a watch-state not a siren (no aggressive red) */
--untracked: #8AA0B4;   /* untracked work — neutral slate; signal, NOT a violation */
--blocked:   #E8806B;   /* hard red reserved ONLY for true failure (rare) — soft coral, not fire-engine */
```

**Semantic design note (load-bearing):** the four-quadrant model (`multi-source-harness-strategy.md`) is **non-judgmental** — "untracked," never "unauthorized." So **untracked = neutral slate**, and **at-risk = amber watch**, not red. Red is reserved for genuine breakage only, and even then it's a soft coral. The palette must never make a developer feel *accused*. On-track deliberately reuses the accent cyan — "on-track" and "the good signal" are the same color, reinforcing trust.

### Type scale & fonts

Fonts (all free / open-source):
- **Display:** Fraunces (variable, optical) — headings, with one italic emphasis word per headline.
- **Body / UI:** Inter (or Geist Sans).
- **Data / numerals / inline code:** Geist Mono (or JetBrains Mono) — used for PR counts, % complete, cycle numbers, timestamps. The mono on data is a *grounding cue*: it reads as "measured, not generated."

```
Display XL   Fraunces  56 / 1.05  -0.02em   (hero)
Display L    Fraunces  40 / 1.1   -0.01em   (section)
Heading      Inter     22 / 1.25  600
Subhead      Inter     17 / 1.4   500   --muted
Body         Inter     16 / 1.6   400
Small        Inter     14 / 1.5   400  --muted
Data/Mono    Geist Mono 14 / 1.4  500   (stats, counts, %)
Caption      Inter     12.5 / 1.4 500   --muted  (timestamps, labels)
```

### Spacing / radius / shadow feel

- **Spacing:** 4px base; generous — the calm comes from whitespace (steal Gitmore's air). Section padding 96–128px desktop.
- **Radius:** 16px cards, 12px buttons/inputs, 8px chips/badges, 999px pills/avatars. Soft but not bubbly.
- **Shadows:** almost none in dark mode — depth comes from **surface elevation + the accent glow**, not drop shadows. The signature elevation is the **cyan glow** (`0 0 0 1px var(--hairline), 0 8px 40px var(--accent-glow)`) on the framed product shot and on focus rings. This is the cool counterpart to Gitmore's amber glow.
- **Borders:** 1px `--hairline` everywhere — hairlines do the structural work (editorial-print discipline from Direction B).

### The accent's role (strict)

`--accent` cyan is **the single light** — use it sparingly so it stays meaningful: primary CTA, on-track status, the rising hero glow, focus rings, the octopus eye/highlight, one emphasis underline. **Never** flood it. If everything glows, nothing is the signal. (Same one-accent discipline that makes Gitmore's gold read as taste.)

---

## 4. The octopus mascot — "Inky"

**Stance: abstract-leaning, calm, a confident line mark — not a cartoon.** It must coexist with "trustworthy reporting," so think *colophon / maker's mark / quiet companion*, closer to the GitHub Octocat's restraint or Linear's geometric calm than to a Slackbot-style cartoon.

- **Form:** a simple, rounded **single-weight line octopus**, often reduced to *just the head/eye + a few suggested arms* (the "many arms = many sources" read). One small cyan highlight on the eye = the bioluminescent accent. At small sizes, collapses to a minimal ink-drop-with-eye glyph.
- **Favicon / wordmark:** the minimal head glyph in cyan-on-ink. Wordmark "Inky" in Fraunces, with the octopus as the dot/counter or sitting before the word.
- **Loading / transitions:** **ink-diffusion bloom** (ink spreading into water) — the signature motion. The octopus releases a small ink cloud that resolves into the standup. Respect `prefers-reduced-motion` (fade, no bloom).
- **Empty states:** Inky at rest — a calm, small line octopus, *not* a sad/Pixar-eyes mascot. Tone: "nothing to report yet, and that's fine." e.g. a softly glowing octopus with one arm curled.
- **Discord standup footer:** the 🐙 (or the line glyph) + "Written by Inky" — this is the **viral surface** (per §6.3 strategy), so the mark must look intentional and premium in a Discord embed at 16–20px. It signs the report like an editor's mark.
- **The "many arms" usage:** when illustrating multi-source, let arms reach toward source logos (GitHub/Linear/Notion/Granola) converging on the calm central body. Use this as ONE marketing illustration, not the whole brand (avoids the node-graph cliché).

**Tone guardrail:** friendly but *never childish*. Inky is a competent, calm colleague who happens to be an octopus — not a toy. No googly eyes, no exclamation, no bounce. It can have a quiet personality (a single blink animation, a curled arm) but it always reads as *trustworthy*.

---

## 5. Voice & copy tone

**Inky's voice: confident, calm, plain-spoken, anti-hype.** It talks like a senior colleague who did the homework and reports the facts without drama. It is *grounded* — it never claims more than it verified.

**Triangulate against the neighbors:**
- **Not Gitmore's casual-snark** ("No YAML hell," "we're not pushy about it"). Inky doesn't do banter or winks. Likeability comes from *being right and calm*, not from jokes.
- **Not enterprise-speak** ("leverage synergies," "actionable insights," "empower your organization"). No buzzwords, no hype, no "AI-powered" as a brag.
- **The Inky register:** short declarative sentences. Plain nouns. Specific numbers. Admits limits ("no activity on these three — worth a look"). Calm even when flagging risk. Never accusatory about people.

**Principles**
1. **State facts, not vibes.** "4 PRs merged, 2 in review" beats "lots of momentum today!"
2. **Calm over urgent.** Flag at-risk as a heads-up, never an alarm.
3. **Never accuse.** "Untracked," never "unauthorized." People firefight; that's signal, not crime.
4. **Earn trust by admitting gaps.** "Nothing linked these — I didn't guess" is a *feature* line.
5. **One idea per sentence.** Skimmable. Like a good standup.

**Example microcopy**

- **Hero headline:** *Your team's standup, written for you — from what actually shipped.*
  (italic emphasis word in Fraunces: "written *for you*" — or lead with the line below.)
- **Hero alt / tagline:** *Many sources. One calm brain. The standup nobody has to type.*
- **Primary button:** `Add Inky to Discord` (secondary: `See a real standup →`)
- **Empty state:** *Nothing to report yet. Inky's watching — the first standup lands tomorrow morning.*
- **Standup footer (Discord):** *🐙 Written by Inky from today's GitHub & Linear activity. Facts only — nothing invented.*
- **At-risk status line:** *Cycle 23 — 60% elapsed, 40% of points merged. 3 issues have no linked PR activity yet. Worth a look.*
- **Untracked line:** *2 PRs shipped without a linked issue. Real work, just untracked — flagging, not flagging anyone.*
- **On-track line:** *Auth refactor (#142) — on track. PR #318 merged, 2 reviews, tests green.*

---

## 6. Applied sketches (layout, not code)

### 6.1 Marketing hero — "Abyssal"

```
┌──────────────────────────────────────────────────────────────────────┐
│  🐙 Inky          Product   How it works   Self-host   Pricing   [Add to Discord] │  ← hairline nav on --bg
│ ─────────────────────────────────────────────────────────────────────│
│                                                                        │
│                  (faint sonar-contour rings + ink-bloom, very subtle)  │
│                                                                        │
│              Your team's standup,                                      │  ← Fraunces Display XL, --text
│              written  for  you.                                        │  ← "for you" italic, cyan underline
│                                                                        │
│         Inky reads what your team actually shipped across GitHub       │  ← Inter body, --muted, max ~620px
│         and Linear and writes a grounded daily standup. No typing.     │
│         No guessing. Facts only.                                       │
│                                                                        │
│         [ Add Inky to Discord ]   See a real standup →                 │  ← primary = cyan-on-ink; ghost link
│                                                                        │
│         ◷ GitHub   ◷ Linear   ◷ Notion   ◷ Granola   (small, --muted)  │  ← "many sources" row, no logos shouting
│                                                                        │
│     ╭───────────────────────────────────────────────────────────────╮ │
│     │  (product screenshot of a standup card)                        │ │  ← --surface card, 16px radius,
│     │                                                                │ │     1px --hairline, cyan outer GLOW
│     │   the cool counterpart to Gitmore's amber-glow framed shot     │ │     (0 8px 40px --accent-glow)
│     ╰───────────────────────────────────────────────────────────────╯ │
└──────────────────────────────────────────────────────────────────────┘
```

Key moves: dark `--bg`, one cyan accent (CTA + emphasis underline + the rising glow), serif-italic headline (Gitmore's structure, Fraunces not their face), the product shot framed in a cool-glow card, the four sources whispered not shouted, generous whitespace.

### 6.2 Standup / dashboard card (the product shot itself)

```
╭─────────────────────────────────────────────────────────────────╮
│  🐙  Daily Standup — Acme Web Team            Thu Jun 5 · 9:00am  │  ← Fraunces heading + mono timestamp, --muted
│  ───────────────────────────────────────────────────────────────│  ← hairline
│                                                                   │
│  Yesterday the team merged 4 PRs and opened 2. Most of the work  │  ← Inter body, --text. Inky's written narrative
│  centered on the billing refactor; review activity was steady.   │
│                                                                   │
│  STATUS vs PLAN — Cycle 23                                        │  ← mono label, --muted, tracked-letterspacing
│                                                                   │
│   ● On track    Auth refactor #142   PR #318 merged · 2 reviews  │  ← --ok cyan dot, mono refs
│   ● On track    Webhook retries #150 PR #321 merged · tests green │
│   ◐ At risk     Search index #147    no linked PR yet · 4d idle  │  ← --at-risk amber dot, calm phrasing
│   ○ Untracked   PR #324  rate-limit fix   no linked issue        │  ← --untracked slate ring, neutral
│                                                                   │
│   ▸ Cycle 23: 60% elapsed · 40% of points merged                 │  ← mono stat strip, --muted
│  ───────────────────────────────────────────────────────────────│
│  🐙 Written by Inky · GitHub + Linear · Facts only — nothing      │  ← footer mark, the viral surface
│     invented.                                  [ Ask Inky → ]     │
╰─────────────────────────────────────────────────────────────────╯
```

Status glyphs are calm dots/rings, not red/green traffic-light alarms: ● cyan on-track, ◐ amber at-risk, ○ slate untracked. Mono on every fact (refs, counts, %) is the visual promise of *grounded*. The footer signs the report like an editor's colophon — and it's the organic-reach surface, so it's designed to look premium at small sizes in a Discord embed.

---

## 7. One-paragraph build-handoff summary

Build Inky on **Abyssal**: an ink-navy canvas (`#0A1420`) with `#121F30` surfaces, cool off-white text (`#EAF2F8`), a single bioluminescent **cyan accent** (`#3DE0D2`) used sparingly as "the one light," and a calm, non-alarmist semantic set (cyan on-track / amber `#F2B45C` at-risk / slate `#8AA0B4` untracked / soft-coral blocked for true failure only). Type is **Fraunces** display with one italic emphasis word per headline (Gitmore's editorial move, our face), **Inter** body, and **Geist/JetBrains Mono** on every fact as a grounding cue. Depth comes from surface elevation + a cool cyan glow (not drop shadows), 16px card radius, hairline `#23384F` borders, and print-grade whitespace. The octopus is a calm single-weight line mark (a colophon, not a cartoon), signing each standup; ink-diffusion is the signature loading motion. Voice is confident, calm, plain-spoken, anti-hype — never snarky like Gitmore, never enterprise-buzzwordy, never accusatory about people. **Lead headline: "Your team's standup, written *for you* — from what actually shipped."**

---

## 8. Implementation status & current decision (updated 2026-06-06)

A working, **token-themed** landing page implements this identity: `inky-landing.html`. Body type
moved from Inter → **Hanken Grotesk** (warmer/humanist; Inter read as the AI-slop tell), and the
display serif now engages **Fraunces' SOFT/WONK/optical axes** so it reads hand-cut. Atmosphere is
restrained (caustic drift, ~14 slow bioluminescent motes, a ghost-octopus watermark, two-light abyss),
all disabled under `prefers-reduced-motion`. Copy moved to a time-saved angle ("No meeting. No typing.
It's already written." + "≈ 4 hours a week a 10-person team never spends"); pricing reordered to ascend
(Self-host → Starter → Pro-featured).

**Current decision (user, 2026-06-06): default palette = "Gold / Anglerfish" — provisional.** The user
prefers a warmer feel (Gitmore-adjacent). **All five palettes are kept live** behind a `data-theme`
switch (a click bar in the page + `?theme=` URL param) so a **designer can revisit and choose** in a
future pass — nothing is deleted. This supersedes the §2 "Abyssal" recommendation as the *shipped
default*, but Abyssal/the others remain first-class options.

The five implemented palettes (each a `:root[data-theme]` block; accent driven by `--accent-rgb` so glows/gradients re-theme cleanly):

| Theme | Canvas | Surface | Text | Accent ("the one light") | Notes |
|---|---|---|---|---|---|
| **Gold — Anglerfish** ⭐ *current default* | `#0C1118` | `#13202A` | `#F6F0E6` | `#F4C56B` warm gold | one warm lure in cold dark water; at-risk shifts to coral `#E8806B` (gold owns on-track) |
| Cyan — Abyssal | `#091320` | `#111E2F` | `#ECF3F8` | `#41E3D4` aqua-cyan | the original §2 recommendation; cool/magical |
| Violet — Squid-Ink | `#0B0F26` | `#15183A` | `#ECEAFB` | `#8A7CFF` ink-violet | literal to the name |
| Phosphor | `#07130F` | `#0F1F18` | `#EAF6EE` | `#54E6A2` biolum-green | anglerfish-algae |
| Paper — Inkwell *(light)* | `#F5F1E8` | `#FFFFFF` | `#1B2330` | `#0E8C86` deep-sea teal | warm editorial like Gitmore but teal-not-gold (the user's stated favorite *look*; closest to Gitmore's lane — differentiate via teal + octopus) |

Semantic set is shared/calm across themes: on-track = the accent, at-risk = amber watch (coral under Gold),
untracked = neutral slate, blocked = soft coral for true failure only. Octopus eye now follows
`currentColor` so the mark re-themes with the accent.

**For the future designer pass:** the palettes above are a starting menu, not a verdict; the open
question is warm-light (Paper, the user's taste, but nearest Gitmore) vs. a distinctive dark
(Gold/Cyan, further from the competitor). The `inky-identity-preview.html` token demo still reflects the
*older* Inter/cyan pass and should be reconciled to whatever the designer locks. The switcher is dev-only
and comes out when a single palette is finalized.
