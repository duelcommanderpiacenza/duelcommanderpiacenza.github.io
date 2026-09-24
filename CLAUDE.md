# duelcommanderpiacenza.github.io

Static site (vanilla HTML/CSS/JS, **no build step**, no framework, no bundler) for a Magic: the Gathering "Duel Commander" club — leagues, events, match results, commander/archetype stats, player standings. Backend is Supabase (Postgres + Auth + Storage). Hosted on GitHub Pages. Italian-language UI.

- `styles.css` — one shared stylesheet for the whole public site (~4000 lines). `admin/css/admin.css` is separate, loaded alongside it on admin pages.
- No React/Vue/etc. Pages are plain `.html` files; each loads a page-specific `js/*-page.js` (or `*-detail.js`) ES module plus shared modules.
- **Nav markup is duplicated verbatim across every public page's `<head>`/`<body>` start** — there's no shared header partial, no server-side includes (GitHub Pages serves static files only). Changing the nav means editing all ~11 public HTML files individually. Same for the PWA-related `<head>` tags (manifest link, apple-mobile-web-app-*, viewport-fit=cover).
- Two separate installable PWA identities: the public site (`manifest.json` at root) and the admin app (`admin/manifest.json`), each with their own icon set — admin's icons are the same club logo recolored black instead of red, both use `id`/`scope` to stay distinct as separate installs from the same origin.

## Data model (Supabase, see `supabase/schema.sql`)

No ORM — `js/db.js` is a thin wrapper: `Entity.method()` functions that `await` a Supabase query and throw on error. Grouped by table:

| Table | Key fields | Notes |
|---|---|---|
| `leagues` | `name`, `is_open`, `is_topdeck` | At most one open league and one open Topdeck series at a time (partial unique index) |
| `events` | `name` (nullable), `event_date`, `league_id` (null = standalone), `rounds`, `is_open` | An open/future event isn't "published" yet — only shown as a homepage preview |
| `event_entries` | `event_id`, `player_id`, `commander_id`, `partner_commander_id` (optional), `archetype`, `bonus_points`, `manual_rank` | One entry per player per event. **No `archetypes` table** — archetype is a fixed 5-value Postgres enum (aggro/control/combo/tempo/midrange) column directly on the entry |
| `matches` | `event_id`, `round`, `player1_id`, `player2_id` (nullable = bye), `player1_wins`/`draws`/`player2_wins` (game score, best-of-3), `is_drop` | Winrate everywhere on the site is **game-basis, not match-basis** — a 2-0 counts for more than a 2-1 |
| `commanders` | `name`, `color_identity`, `is_banned` | A "deck" elsewhere in the code = commander + optional partner combo, not just the commander alone |
| `players` | `name`, `handle`, `badge1_id`, `badge2_id` | Two manually-assignable badge slots |
| `badges` | `name`, `icon` (emoji) or `icon_url` (Storage), `auto_rule` (enum or null=manual), `priority` | Auto-computed badges (league winner, top8 streak, etc.) are computed live client-side by `js/auto-badges.js`, not stored |
| `announcements` | `title`, `body` | Flat list, homepage only |

RLS: public read is scoped so an open (unpublished) event is only visible from its own date onward; entries/matches are gated to closed events only. All writes require `auth.role() = 'authenticated'` — public sign-up must stay disabled in the Supabase dashboard.

## Page inventory

Public (`js/db.js`-backed unless noted):

| Page | Script |
|---|---|
| `index.html` (Bacheca) | `js/home.js` — announcements, upcoming events, active league standings, latest events, most-played-commanders donut chart |
| `events.html` (Leghe & Eventi) | `js/events-page.js` — collapsible per-league event cards |
| `event.html` | `js/event-detail.js` |
| `league.html` | `js/league-detail.js` |
| `commanders.html` | `js/commanders-page.js` — sortable stats table + metagame pie |
| `commander.html` | `js/commander-detail.js` |
| `archetypes.html` | `js/archetypes-page.js` |
| `matchups.html` | `js/matchups-page.js` — commander-vs-commander winrate heatmap |
| `players.html` | `js/players-page.js` |
| `player.html` | `js/player-detail.js` |
| `social.html` | **not** Supabase-backed — reads `decks.json`/`videos.json` (repo files, refreshed daily by a GitHub Actions cron via `scripts/update-latest-*.mjs`), rendered by classic script `moxfield.js` |

Admin (`admin/index.html`, single-page app, login-gated): top tab bar has `players`/`commanders`/`badges`/`leagues`/`standalone-events`/`announcements`. Events/entries/matches are **drill-down panels**, not top tabs — click into a league to manage its events, click into an event to manage its entries/matches (`admin/js/events-admin.js`, `entries-admin.js`, `matches-admin.js`). `admin/js/bus.js` is a tiny pub/sub so panels can notify each other of changes (e.g. new commander → refresh a dropdown elsewhere).

## Shared JS conventions

- **`custom-select.js` / `custom-date.js`** — progressive-enhancement skins over native `<select>`/`<input type=date>`. The native element stays the source of truth (`.value`, `change` events, `<option>` list) and is moved *inside* a new wrapper (`.cs-wrap`/`.cd-wrap`), hidden but functional. **This means a select/date field's actual DOM child, once enhanced, is that wrapper — not the original element directly** — matters for any CSS `:has(> select)`-style selector or JS querying `.field`'s direct children.
- **`scope-filter.js`** — shared league→event linked-select widget (Commanders, Archetypes, commander-detail, Players pages all use it via `initScopeFilter()`).
- **`stats.js`/`leaderboard.js`/`winrate.js`** — pure scoring/aggregation logic, no DOM. Keep scoring-rule changes isolated here.
- Every page's `<head>` has an inline synchronous script (before first paint) that sets `data-theme` (dark/light) and adds `html.nav-mobile` if `navigator.maxTouchPoints > 0` — any touch device, no width check, no CSS media query involved at all. Same one-liner duplicated in `js/nav-dropdown.js`'s/`admin/js/admin-nav-dropdown.js`'s own self-healing fallback (`isMobileNav()`), and in `admin/index.html`'s own inline script. All mobile-pill CSS (`styles.css`'s `.site-nav` block, `admin/admin.css`'s `.admin-tabs` block) is gated purely on the `html.nav-mobile` class too, with **no `@media` wrapper** — see gotcha #9 below for why.

## Nav & responsive breakpoints

- **900px** — nav switches from wrapping tabs to a single horizontally-scrollable row.
- **Any touch device** (`html.nav-mobile`, see above) — nav becomes a floating pill fixed to the bottom of the screen; tapping it opens an upward panel listing all tabs. This is the *only* place safe-area-inset / overscroll-behavior fixes were added — desktop-without-touch is the only thing that still gets the normal nav. This intentionally also covers touch laptops/tablets/iPad now (not just phones) — an earlier, narrower version tried gating on `max-width: 640px` plus `pointer: coarse`/`hover: none`, which excluded those on purpose, but that media-query condition itself turned out to be unreliable on real phones (Samsung Internet) and was dropped entirely rather than patched further.
- **Reusable nav-submenu scaffolding, currently unwired**: `.nav-item-has-sub` / `.nav-sub-hint` / `.nav-submenu` / `.nav-sublink` in `styles.css` implement a full "tab with a hover popup on desktop, always-visible nested row on mobile" pattern. It was built and tried for nesting "Matchups" under "Comandanti", then reverted back to Matchups being its own top-level tab per product decision — but the CSS was deliberately left in place for the next tab that needs to nest under another one. To reuse: wrap a `<a class="nav-link">` + sibling `<div class="nav-submenu">` in `<div class="nav-item-has-sub">`, submenu children are `<a class="nav-sublink" data-nav="X">`; add a `body[data-active-nav="X"] .nav-sublink[data-nav="X"]` active-highlight rule (there's no generic one, it was removed with the Matchups wiring). Needs duplicating across all public pages' nav markup, same as any other nav change.

## Non-obvious gotchas (hit and fixed this session — avoid repeating)

1. **`overflow: hidden` on an element clips its own `::before`/`::after` too**, even ones meant to render outside its box (tooltips, dropdown shadows). If an element needs both truncation (`text-overflow: ellipsis`) *and* to host an absolutely-positioned popup/tooltip, put the truncation on an inner wrapper instead and keep the outer element unclipped.
2. **A scrolling container's `overflow-x: auto` forces `overflow-y` to also clip** (per the CSS overflow spec, whichever axis isn't explicitly set gets forced to `auto`/clipping too once the other is non-`visible`). A tooltip/popup anchored inside a horizontally-scrolling table (`.matchups-matrix-wrap`) cannot escape that clipping with CSS alone — it has to be a real element positioned via JS (`getBoundingClientRect`) and appended to `<body>`, outside the clipping ancestor. See `js/matchups-page.js`'s `showMatchupsTooltip`.
3. **`mouseenter`/`mouseleave` don't bubble**, so event-delegation on a parent needs the capture phase (`addEventListener(type, fn, true)`). And if the hovered element has a child (e.g. a truncation `<span>` inside a `<th>`), capture-phase mouseenter/mouseleave fire *separately* for the child too as the cursor crosses that inner boundary — guard against re-triggering show/hide by tracking the currently-active target and checking `relatedTarget` on leave.
4. **`display: inline-flex` doesn't imply column direction.** A flex wrapper with two `width: 100%` children (e.g. a nav link + its submenu, in the mobile always-visible layout) needs an explicit `flex-direction: column` override, or the children sit side by side and the second one gets pushed off-screen — invisible, not just misaligned, if the ancestor also has `overflow-x: hidden`.
5. **Android's adaptive-icon system shrinks a non-`maskable` PWA icon defensively** (lots of padding) since it doesn't know how a launcher will crop it. A `purpose: "maskable"` icon variant with content filling ~70–80% of the canvas (this site uses 70%) against an opaque background fixes it — transparent backgrounds don't work for maskable icons, the OS crops the full square regardless.
6. **`beforeinstallprompt` (and the custom "Install app" banner built on it) is Chrome/Android-only** — Safari/WebKit has never implemented it, on iPhone or iPad. Don't expect it to fire there; the only install path on iOS is the manual Share → "Add to Home Screen".
7. Service worker (`sw.js`) is a deliberate no-op (pure network pass-through, no caching) — it exists only to satisfy Chrome's PWA installability check, since the site's data is always-live from Supabase and caching would show stale results.
8. **A generic dark-mode override can win on specificity over a more specific mobile-state rule**, even when the mobile rule is more semantically "specific" — `:root[data-theme="dark"] .site-nav { background: ... }` (3 classes) beat `html.nav-mobile .site-nav { background: none; }` (2 classes + 1 element) regardless of source order, reasserting a solid background behind the floating nav pill in dark mode. Fix is a compound selector combining both conditions on the same `<html>` element — `html[data-theme="dark"].nav-mobile .site-nav { background: none; }` — placed near the other dark+mobile combo overrides, not just relying on cascade order. Same bug, same fix, existed independently in `admin/admin.css` for `.admin-tabs`.
9. **Wrapping already-class-gated CSS in a redundant `@media` condition means BOTH have to independently match, and they can disagree.** The mobile-pill CSS was originally inside `@media (max-width: 640px) and (pointer: coarse) and (hover: none) { html.nav-mobile .site-nav { ... } }` — belt-and-suspenders with the JS-set class, in theory. In practice, some browsers (Samsung Internet) misreport `pointer`/`hover`, so the `@media` condition silently failed to match even when `html.nav-mobile` was correctly set by JS — the styling just never applied, with no error, nothing to debug from the DOM (the class was right there). Fixed by dropping the `@media` wrapper entirely and trusting the JS-set class as the single source of truth, rather than trying to patch the media query further.
