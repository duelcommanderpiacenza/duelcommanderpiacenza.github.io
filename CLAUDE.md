# duelcommanderpiacenza.github.io

Static site (vanilla HTML/CSS/JS, **no build step**, no framework, no bundler) for a Magic: the Gathering "Duel Commander" club — leagues, events, match results, commander/archetype stats, player standings. Backend is Supabase (Postgres + Auth + Storage). Hosted on GitHub Pages. Italian-language UI.

- `styles.css` — one shared stylesheet for the whole public site (~4000 lines). `admin/css/admin.css` is separate, loaded alongside it on admin pages.
- No React/Vue/etc. Pages are plain `.html` files; each loads a page-specific `js/*-page.js` (or `*-detail.js`) ES module plus shared modules.
- **Nav markup is duplicated verbatim across every public page's `<head>`/`<body>` start** — there's no shared header partial, no server-side includes (GitHub Pages serves static files only). Changing the nav means editing all ~11 public HTML files individually. Same for the PWA-related `<head>` tags (manifest link, apple-mobile-web-app-*, viewport-fit=cover).
- Two separate installable PWA identities: the public site (`manifest.json` at root) and the admin app (`admin/manifest.json`), each with their own icon set — admin's icons are the same club logo recolored black instead of red, both use `id`/`scope` to stay distinct as separate installs from the same origin.
- **New accent-colored UI elements (buttons, badges, small floating controls, etc.) should default to the brand-red family** (`--brand-red` and friends, `rgba(220, 24, 28, ...)` for translucent variants) rather than a neutral dark/gray tint — an explicit standing preference, not just this one element's choice. `.badge-status-open` and the commander-detail flip button are the existing examples to match.

## Data model (Supabase, see `supabase/schema.sql`)

No ORM — `js/db.js` is a thin wrapper: `Entity.method()` functions that `await` a Supabase query and throw on error. Grouped by table:

| Table | Key fields | Notes |
|---|---|---|
| `leagues` | `name`, `is_open`, `is_topdeck` | At most one open league and one open Topdeck series at a time (partial unique index) |
| `events` | `name` (nullable), `event_date`, `league_id` (null = standalone), `rounds`, `is_open` | An open/future event isn't "published" yet — only shown as a homepage preview |
| `event_entries` | `event_id`, `player_id`, `commander_id`, `partner_commander_id` (optional), `archetype`, `bonus_points`, `manual_rank` | One entry per player per event. **No `archetypes` table** — archetype is a fixed 5-value Postgres enum (aggro/control/combo/tempo/midrange) column directly on the entry |
| `matches` | `event_id`, `round`, `player1_id`, `player2_id` (nullable = bye), `player1_wins`/`draws`/`player2_wins` (game score, best-of-3), `is_drop` | Winrate everywhere on the site is **match-basis** — a 2-0 and a 2-1 match win both just count as one win (`wins / (wins+draws+losses)`), not the individual best-of-3 game score. The one deliberate exception is `js/leaderboard.js`'s MTG tournament tiebreakers (Game Win %, Opponents' Game/Match Win %) — that's the official DCI/WPN tiebreak formula, a different, never-displayed calculation, not this site's own choice of how to show "winrate" |
| `commanders` | `name`, `color_identity`, `is_banned` | A "deck" elsewhere in the code = commander + optional partner combo, not just the commander alone |
| `players` | `name`, `handle`, `badge1_id`, `badge2_id` | Two manually-assignable badge slots |
| `badges` | `name`, `icon` (emoji) or `icon_url` (Storage), `auto_rule` (enum or null=manual), `priority` | Auto-computed badges (league winner, top8 streak, etc.) are computed by `js/auto-badges.js` and cached into `player_badges_auto`, recomputed only when an event/league closes (`admin/js/badges-sync.js`) — not live on every page view |
| `player_badges_auto` | `player_id`, `badge_id` | Pure derived cache (no id/created_at) — fully replaced (delete-all + reinsert) by `admin/js/badges-sync.js`, read by public pages via `js/db.js`'s `PlayerAutoBadges` |
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
- **`site-search.js`** — site-wide search, one shared markup block (`.site-search*` in every public page's `<header>`) styled two ways by CSS rather than built as two widgets: desktop shows an always-visible translucent pill inline in the header; `html.nav-mobile` collapses it to a round trigger button that opens the same field + results as a full-screen overlay. Live dropdown only (no separate results page) — Players/Events/Leagues/Commanders are fetched once, lazily on first open (not on every page load), then filtered client-side by substring match on every keystroke; there's no server-side/full-text search. Results are one flat ranked list (not grouped under per-type headings) with a small `.site-search-result-type` pill on each row instead — deliberately a lighter-weight pill than `.badge-status`, so it reads as a type label, not a status.
- **`metagame-chart.js`** (donut/bar, pure CSS via `conic-gradient`/width-%) and **`line-chart.js`** (smooth time-series, hand-rolled SVG with a Catmull-Rom→Bezier curve) — the two chart-drawing modules; no charting library anywhere in the repo. All return an HTML string wrapped in `.pie-chart-wrap` (that class name is shared by every chart shape, including the line chart, for one consistent card look). The line chart's SVG uses a fixed `viewBox` scaled via CSS `aspect-ratio` (not `preserveAspectRatio="none"`), so dots stay circular and the stroke width stays even as the card's width changes. Its x axis is always capped to the data's own most recent 2 years (`windowToMaxSpan`/`windowDatesToMaxSpan`) and labeled with generated "nice" month ticks (`monthTicks`, step adapts to keep ~5-6 labels regardless of span) rather than the exact dates data happens to fall on. `renderMultiLineChart` plots several series against one *shared* `dates` array — callers must fill in an explicit 0 for a series' value on any date it has no data for, rather than omitting that date, so a line actually dips to zero instead of the curve skipping over it as if that date didn't exist for that series. **Currently unused** (built for an Archetipi "usage per archetype over time" chart, one line per archetype, then deliberately left out — too little event history yet for 5 overlapping lines to read as anything but noise; revisit once there's more data) — not wired into any page, but kept since the next per-series time chart can reuse it as-is.
- **`stats.js`/`leaderboard.js`/`winrate.js`** — pure scoring/aggregation logic, no DOM. Keep scoring-rule changes isolated here.
- Every page's `<head>` has an inline synchronous script (before first paint) that sets `data-theme` (dark/light) and adds `html.nav-mobile` if `navigator.maxTouchPoints > 0` — any touch device, no width check, no CSS media query involved at all. Same one-liner duplicated in `js/nav-dropdown.js`'s/`admin/js/admin-nav-dropdown.js`'s own self-healing fallback (`isMobileNav()`), and in `admin/index.html`'s own inline script. All mobile-pill CSS (`styles.css`'s `.site-nav` block, `admin/admin.css`'s `.admin-tabs` block) is gated purely on the `html.nav-mobile` class too, with **no `@media` wrapper** — see gotcha #9 below for why.

## Nav & responsive breakpoints

- **900px** — nav switches from wrapping tabs to a single horizontally-scrollable row.
- **Any touch device** (`html.nav-mobile`, see above) — nav becomes a floating pill fixed to the bottom of the screen; tapping it opens an upward panel listing all tabs. This is the *only* place safe-area-inset / overscroll-behavior fixes were added — desktop-without-touch is the only thing that still gets the normal nav. This intentionally also covers touch laptops/tablets/iPad now (not just phones) — an earlier, narrower version tried gating on `max-width: 640px` plus `pointer: coarse`/`hover: none`, which excluded those on purpose, but that media-query condition itself turned out to be unreliable on real phones (Samsung Internet) and was dropped entirely rather than patched further.
- **Reusable nav-submenu scaffolding, currently unwired**: `.nav-item-has-sub` / `.nav-sub-hint` / `.nav-submenu` / `.nav-sublink` in `styles.css` implement a full "tab with a hover popup on desktop, always-visible nested row on mobile" pattern. It was built and tried for nesting "Matchups" under "Comandanti", then reverted back to Matchups being its own top-level tab per product decision — but the CSS was deliberately left in place for the next tab that needs to nest under another one. To reuse: wrap a `<a class="nav-link">` + sibling `<div class="nav-submenu">` in `<div class="nav-item-has-sub">`, submenu children are `<a class="nav-sublink" data-nav="X">`; add a `body[data-active-nav="X"] .nav-sublink[data-nav="X"]` active-highlight rule (there's no generic one, it was removed with the Matchups wiring). Needs duplicating across all public pages' nav markup, same as any other nav change.

## Commander detail page: Scryfall card art

`commander.html`/`js/commander-detail.js` shows the commander's own Scryfall
card image next to its name, spanning from the title down to the bottom of
the stat tiles (desktop), or stacked below the title (mobile, ≤640px).

- **Fetch**: `fetchScryfallCard(name)` does a real JSON `fetch()` to
  `/cards/named?exact=...` (not the simpler `format=image` redirect trick)
  because a double-faced commander needs both faces' own `image_uris` to
  flip between, not just one. `scryfallCardImages(card)` distinguishes true
  double-faced cards (`card_faces[].image_uris` present on every face) from
  split/adventure/flip cards (a single combined image, `card.image_uris`
  only) — that's the actual signal for whether the flip button appears, not
  just the presence of `card_faces`. Loaded independently of the page's own
  Supabase data (not awaited) — a slow/unreachable Scryfall never blocks the
  real page, a failed/no-match lookup just leaves the figure hidden.
- **Sizing**: `syncCardImageLayout()` sets the image's height in JS (px,
  measured from `.page-heading`'s top to the stat tiles' bottom — two
  separate elements with no CSS-only way to span between them), then reads
  the image's own resulting width back and sets it as
  `.commander-top-row-main`'s `padding-right`, so the stat tiles grow right
  up to the card's real (height-dependent) edge instead of stopping short
  at a fixed guess.
- **Reveal timing**: the Scryfall image and the Supabase winrate stats load
  independently in unpredictable order — revealing the card as soon as
  either one alone is ready risks measuring/sizing against the other's
  still-showing placeholder. A `cardImageReady`/`statsReady` two-flag latch
  (`revealCardIfReady()`) holds the card hidden until both are true.
- **Flip (double-faced cards only)**: a real CSS 3D flip (`.commander-card-flipper`
  toggling `.is-flipped { transform: rotateY(180deg) }`, both faces stacked
  as separate `<img>`s with `backface-visibility: hidden`), not a
  swap-on-click. `perspective` and the entrance animation both live on a
  dedicated `.commander-card-perspective` wrapper *one level below*
  `.commander-card-figure`, never on the figure itself — either one directly
  on the figure creates a stacking context that broke click-through to the
  sibling flip button, even with `pointer-events: none` on its icon (see
  gotcha #10).
- **Mobile title fit**: `fitCommanderTitle()` shrinks `#commander-title`'s
  font-size (down to a 17px floor) when the name + color-identity pips
  don't fit the width actually left next to the back button on a phone,
  measured against the text's own natural unwrapped width — not a fixed
  smaller mobile font-size, so short names stay full-size and only long
  ones shrink, only as much as they need to. Paired with
  `alignBackButtonToTitle()`: `.page-heading-row`'s mobile
  `align-items: flex-start` only top-aligns the back button with the
  title (needed so it anchors to the name, not the card image stacked
  below it on mobile) — once the title's own font-size shrinks well below
  the button's 44px, top-aligning no longer puts their *centers* level.
  This nudges the button's `margin-top` by the exact difference so it
  stays vertically centered against whatever the title's actual rendered
  height ends up being.

## Non-obvious gotchas (hit and fixed this session — avoid repeating)

1. **`overflow: hidden` on an element clips its own `::before`/`::after` too**, even ones meant to render outside its box (tooltips, dropdown shadows). If an element needs both truncation (`text-overflow: ellipsis`) *and* to host an absolutely-positioned popup/tooltip, put the truncation on an inner wrapper instead and keep the outer element unclipped.
2. **A scrolling container's `overflow-x: auto` forces `overflow-y` to also clip** (per the CSS overflow spec, whichever axis isn't explicitly set gets forced to `auto`/clipping too once the other is non-`visible`). A tooltip/popup anchored inside a horizontally-scrolling table (`.matchups-matrix-wrap`) cannot escape that clipping with CSS alone — it has to be a real element positioned via JS (`getBoundingClientRect`) and appended to `<body>`, outside the clipping ancestor. See `js/matchups-page.js`'s `showMatchupsTooltip`.
3. **`mouseenter`/`mouseleave` don't bubble**, so event-delegation on a parent needs the capture phase (`addEventListener(type, fn, true)`). And if the hovered element has a child (e.g. a truncation `<span>` inside a `<th>`), capture-phase mouseenter/mouseleave fire *separately* for the child too as the cursor crosses that inner boundary — guard against re-triggering show/hide by tracking the currently-active target and checking `relatedTarget` on leave.
4. **`display: inline-flex` doesn't imply column direction.** A flex wrapper with two `width: 100%` children (e.g. a nav link + its submenu, in the mobile always-visible layout) needs an explicit `flex-direction: column` override, or the children sit side by side and the second one gets pushed off-screen — invisible, not just misaligned, if the ancestor also has `overflow-x: hidden`.
5. **Android's adaptive-icon system shrinks a non-`maskable` PWA icon defensively** (lots of padding) since it doesn't know how a launcher will crop it. A `purpose: "maskable"` icon variant with content filling ~70–80% of the canvas (this site uses 70%) against an opaque background fixes it — transparent backgrounds don't work for maskable icons, the OS crops the full square regardless.
6. **`beforeinstallprompt` (and the custom "Install app" banner built on it) is Chrome/Android-only** — Safari/WebKit has never implemented it, on iPhone or iPad. Don't expect it to fire there; the only install path on iOS is the manual Share → "Add to Home Screen".
7. Service worker (`sw.js`) is a deliberate no-op (pure network pass-through, no caching) — it exists only to satisfy Chrome's PWA installability check, since the site's data is always-live from Supabase and caching would show stale results.
8. **A generic dark-mode override can win on specificity over a more specific context rule that resets a background to transparent**, even when that rule is more semantically "specific." The generic dark-mode "give this a faint card background" rules (`styles.css`, the big `:root[data-theme="dark"] .card, .stat-tile, .pie-chart-wrap, ...` list) are 3 classes; a narrower "this one shouldn't have its own background, it's nested inside another card" rule like `.dashboard-card-commanders .pie-chart-wrap { background: none; }` is usually only 2 — the generic rule wins regardless of source order, silently reintroducing a visible background the narrower rule was trying to remove. Hit **three separate times** this session with this exact shape (`html.nav-mobile .site-nav`, `admin/admin.css`'s `.admin-tabs`, and `.dashboard-card-commanders .pie-chart-wrap`) — worth checking for this pattern by default whenever a "make this transparent/none in context X" rule doesn't seem to be working in dark mode specifically. Fix is always the same: a compound selector combining `:root[data-theme="dark"]` (or `html[data-theme="dark"]`) with the narrower context class(es) in one selector, placed near the other dark-mode overrides, not just relying on cascade order.
9. **Wrapping already-class-gated CSS in a redundant `@media` condition means BOTH have to independently match, and they can disagree.** The mobile-pill CSS was originally inside `@media (max-width: 640px) and (pointer: coarse) and (hover: none) { html.nav-mobile .site-nav { ... } }` — belt-and-suspenders with the JS-set class, in theory. In practice, some browsers (Samsung Internet) misreport `pointer`/`hover`, so the `@media` condition silently failed to match even when `html.nav-mobile` was correctly set by JS — the styling just never applied, with no error, nothing to debug from the DOM (the class was right there). Fixed by dropping the `@media` wrapper entirely and trusting the JS-set class as the single source of truth, rather than trying to patch the media query further.
10. **`perspective` and any CSS `animation`/`transition` that animates `transform` both create a stacking context on whatever element they're set on**, for as long as `animation-fill-mode` holds it there (not just while actively animating). A sibling element positioned to overlap that one (e.g. the commander card's flip button sitting over the card image) can become unclickable even with `pointer-events: none` on its own icon, because the *ancestor* now stacks the whole overlapping region above the sibling. Fix: keep `perspective`/animated-`transform` rules on a dedicated inner wrapper, never on the same element an interactive sibling is positioned against — see the commander card's `.commander-card-perspective` split from `.commander-card-figure` above.
11. **A non-`none` `view-transition-name` forces its element into its own stacking context**, same as `perspective`/animated-`transform` above (gotcha #10) but easy to miss since nothing about the property *looks* stacking-related. `.site-header` has `view-transition-name: site-header` (so cross-page navigations treat it as one continuous element) but no explicit `z-index` — meaning that whole forced stacking context only ranked as `z-index: 0` among its siblings, so `.site-nav` right below it (`position: sticky; z-index: 20`) painted *over* it regardless of any `z-index` set on elements *inside* the header (the site-wide search dropdown's own `z-index: 60` couldn't escape it — a descendant's `z-index` only ever competes within its own stacking context, never past it). Fixed by giving `.site-header` itself an explicit `position: relative; z-index: 25` so the whole header, dropdown included, outranks the nav bar. Worth checking for on any other element that sets `view-transition-name` and later turns out to have positioned children needing to float above a later sibling.
