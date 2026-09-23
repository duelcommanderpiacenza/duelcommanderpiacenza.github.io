# Duel Commander Piacenza — Release Notes

The story of this site, told in versions rather than commits — reconstructed
from what actually changed in the codebase at each stage, not from commit
messages.

---

## v0.1 — "Just the decks" *(March 2026)*

The original site: one static page, auto-updated on a schedule.

- Pulls the club's latest Moxfield decklists automatically via a scheduled
  GitHub Action — no admin, no database, just a bot committing
  `decks.json`/`videos.json` on a timer.
- YouTube video feed alongside it.
- Social links (Instagram, Facebook, YouTube, Moxfield).
- A short-lived side quest: a standalone "deck diff" tool, added and then
  quietly removed a few days later.

*What followed: about seven months of silence — nothing but the bot
faithfully refreshing decks and videos, week after week, while the next
version was presumably being planned.*

---

## v1.0 — The Relaunch: a real tournament tracker *(September 18, 2026)*

One enormous commit tears down the single-page site and replaces it with an
actual platform, backed by Supabase.

- **Public site**: Bacheca (home dashboard), Leghe, Eventi, Comandanti,
  Archetipi, Giocatori, Social — each with its own detail pages
  (`league.html`, `event.html`, `commander.html`, `player.html`).
- **Admin panel**: full CRUD for leagues, events, entries, matches,
  players, and commanders.
- **Scoring engine**: match results, standings, and win/loss/points
  tiebreakers computed live from the data, not hand-entered.

This is the real "v1" — everything since is refinement on top of this
foundation.

---

## v1.1 — The polish sprint *(September 19–21)*

The single busiest stretch of the whole project — most of the commit
history lives here. A wave of features layered on fast:

- Dark/light theme toggle.
- Standalone events (tournaments outside any league).
- Custom-styled date pickers and dropdowns, replacing the browser's plain
  native ones.
- A player badge system — some hand-assigned, some auto-computed (e.g.
  *"highest winrate"*, *"most matches played"*).
- **Installable as an app** — a service worker, a manifest, and an install
  prompt banner.
- The **commander matchup matrix** — a head-to-head win% heatmap between
  any commanders you pick.
- A site announcements panel for the admin to post news.
- Sortable tables throughout.

---

## v1.2 — Calendar & charts *(September 22)*

- An **events calendar** overlay on the homepage, marking every event
  across every month.
- Winrate charts reworked from pie slices into bar charts — a percentage
  isn't a "share of the whole", so it shouldn't look like one.
- Assorted display fixes (mobile table scrolling, chart sorting).

---

## v1.3 — Getting winrate *right* *(September 23)*

A correctness pass: byes and dropped players were quietly inflating
winrate numbers in a few places. Fixed properly instead of papered over:

- Bye matches no longer double-count toward a player's own winrate.
- **Dropped players** are now a first-class concept — excluded from
  leaderboards, standings, and every winrate calculation, and no longer
  offered as an opponent in later rounds of the same event.
- A pass of related winrate bugs fixed across the player and commander
  pages.

---

## Unreleased — in progress

Not yet committed, currently on the workbench:

- A redesigned mobile navigation — the 8-tab header collapses into a
  single compact dropdown pill on phones, with the underlying links kept
  as real, crawlable, no-JS-safe `<a>` tags underneath.
- A handful of related UI fixes discovered along the way.
