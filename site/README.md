# Inky — marketing site

A single, self-contained static landing page (`index.html`) in the **friendly / Blurple**
brand direction. No build step, no framework — just static files.

## Deploy (pick one)
- **Cloudflare Pages / Netlify / GitHub Pages / Vercel:** point it at this `site/` directory
  (build command: none; output dir: `site`). Or drag-and-drop the folder onto Netlify Drop.
- **Anything that serves static files** works — it's plain HTML/CSS/JS + the `assets/`.

Local preview: `python3 -m http.server -d site 8080` → http://localhost:8080

## Before going live — three quick edits in `index.html`
1. **Domain for social cards:** replace `https://inky.example` (in the `og:`/`twitter:` meta
   tags) with the real deployed domain so link previews show the banner.
2. **"Add Inky to Discord" buttons:** currently link to the GitHub repo. Swap to the real
   Discord **bot install / OAuth URL** once the app's client id is set
   (`https://discord.com/oauth2/authorize?client_id=…&scope=bot%20applications.commands&permissions=…`).
3. **"Start free trial" buttons:** the hosted tier isn't live yet (Phase 6). They point to the
   repo for now — repoint to the hosted signup when it exists, or hide the hosted tiers until then.

## Notes
- **Fonts** load from Google Fonts (Bricolage Grotesque / Hanken Grotesk / JetBrains Mono) — needs
  network; fine for a hosted page. Self-host the fonts if you want zero third-party requests.
- **Source logos** (GitHub/Linear/Notion/Granola) are inline monochrome SVGs (Simple Icons + svgl).
- The design is also explored in `docs/planning/inky-friendly.html` (this is the productionized copy)
  and an alternate deep-sea direction in `docs/planning/inky-landing.html`. Brand spec:
  `docs/planning/inky-design-identity.md`.
- **Telemetry tie-in (later):** the standup footer link carries `?ref=standup-footer`; this page is
  where `footer_link_clicked` would be measured to close Loop 1 (see `docs/planning/telemetry-design.md`).
- When the Phase 6 Next.js dashboard lands, this page can be ported into it (`apps/dashboard`); until
  then it stays a standalone static site.
