# Endstep leagues — plan (decided, not built yet)

Decided with the user on 2026-10-30, from `_mockup-endstep.html` (deleted after the choice). **Nothing here is built yet**: the user said "don't do it now". Read this before starting, and check that the code it names still looks this way.

## What it is

[endstep.cc](https://endstep.cc) is a browser client for playing Magic online (Forge rules engine). It has tournaments inside it, but no public league or event pages to link to. The plan: **online leagues and events are played on endstep, and their results are entered in our admin by hand, as live ones are today**. Same players, commanders, entries and matches. An import from endstep may come later; see "Who is who".

## Decisions

| Topic | Decision |
|---|---|
| **Data: league kind** | Replace `leagues.is_topdeck` (boolean) with a generic **`leagues.type`**: `'league'` / `'topdeck'` / `'online'` (user's own idea, chosen over a separate `platform` column). |
| **Two open leagues** | Yes: **one open live league and one open online league at the same time** (plus the open Topdeck series, as today). |
| **Meta: Comandanti / Matchups / Archetipi** | A **"Dove" filter: Dal vivo · Online · Tutto, default Dal vivo** (mockup option 3B). |
| **Player page and its history** | Online matches **appear in the history, marked with the endstep logo**. A "Dove" filter on the player's stats: **not decided yet** ("we'll see"). |
| **Automatic badges, player card cosmetics, achievements** | **Live only.** Online games never count towards them. |
| **Recaps (stories)** | Every endstep event and season gets **its own recap, like the others, with the endstep logo in the heading**. |
| **Who is who on endstep** | The player's **endstep username**: account holders already have it on their profile (`profiles.endstep`, migration 032). For the others, a **field in the admin** (on the player). Useful if we ever import results instead of entering them by hand. |

## Look (from the mockup)

- **The endstep mark**: endstep's logo, already drawn for the player card's link (`CARD_LINK_SITES.endstep.icon` in `js/player-card.js`: the diamond, its core and the step bar). Use **its own colours**, read off its site: gold `oklch(0.8 0.135 80)` on near-black `oklch(0.175 0.014 82)` (a second dark shade, used in the mockup: `oklch(0.24 0.016 82)`).
- **League card in Leghe & Eventi: option 1C, "without the top black bar"**.
  - The whole league card (the D1 card in `js/events-page.js`) goes **endstep dark** (`oklch(0.175 0.014 82)`, no border). Gold in place of red:
    - the label above the name ("LEGA SU ENDSTEP", with the logo before it);
    - the progress ring's arc (its track a faint white);
    - the next event's date box (gold, dark text) and its time.
  - Name in light text (`#f3eee4`); the counts line and the next event's day line muted (`#b9ae9b`); the divider a faint white line.
  - ⚠ The user's words were "1C but without the top black bar". In the mockup only **1B** had a black bar (a 5px dark band across the card's top); 1C had none. Most likely 1C exactly as it was. **Confirm with a quick screenshot before building.**
- **Event in the Bacheca: option 2B, with the league's name next to the endstep icon**.
  - On the timeline card (`.home-timeline`, `js/home.js`), the line under the name shows a small endstep disc (the logo, gold on dark, about 16px) **followed by the league's name** ("◆ ENDSTEP LEAGUE 1"). It takes the place where external events show "📍 Milano".
  - The rest of the card is like a live event's.
  - A standalone online event: the disc plus "Online · endstep" (see the open questions).
- **Bacheca on a computer (3B)**: events stay one list, live and online mixed and the online ones marked. The standings card ("Classifica") gets **one tab per open league**: the live one first, then the online one with the logo. **The live league stays the homepage's main league** (the ring in the heading, the stories, …).

## Data model (to do)

1. **Migration: `leagues.type`**
   - Add `type text not null default 'league' check (type in ('league', 'topdeck', 'online'))`.
   - Backfill: `update leagues set type = 'topdeck' where is_topdeck`.
   - Replace the partial unique index `leagues_only_one_open_idx on leagues (is_topdeck) where is_open` with `on leagues (type) where is_open`. That gives exactly one open league per type.
   - Drop `is_topdeck`.
   - Add a rollback; fold it into `schema.sql`; update the README's next number. **Run it on dcp-dev, then live, before pushing** the code that reads `type`.
2. **Players' endstep username**: `players.endstep text` (same check as `profiles.endstep`: a username, not a URL), editable in the admin's player form.
3. **Code that reads `is_topdeck` today**. Every one must move to `type`:
   - the admin's events / leagues / matches forms;
   - `js/auto-badges.js`, `js/db.js`, `js/event-recap.js`, `js/events-page.js`, `js/home.js`, `js/league-detail.js`, `js/player-league-recap.js`;
   - `schema.sql`'s functions and policies.

   `grep -rn "is_topdeck\|isTopdeck"` finds them.
4. **"Live only" means `league.type <> 'online'`** (standalone events: see the open questions). Apply that filter in:
   - the automatic badges (`js/auto-badges.js`, `admin/js/badges-sync.js`);
   - the card cosmetics' progress (`js/card-cosmetics.js` and the progress request in `js/db.js`);
   - the achievements (not built yet; see the `dcp-achievements-decisions` memory).
5. **The "Dove" filter**: next to the existing Lega / Evento filters (`js/scope-filter.js`, the Meta pages' filter panel). It filters entries and matches by their event's league type. Default "Dal vivo", the choice remembered (localStorage).
6. **i18n**: every new Italian text needs its English in `js/i18n-en.js` ("Dove", "Dal vivo", "Online", "Tutto", "Lega su endstep", "Lega online", …).

## Open questions (ask when starting)

- **Standalone online events** (not in an online league): does an event need its own online flag (e.g. `events.is_online`, or `events.type`), or are online events always inside an online league? The user only spoke of the league's type.
- **The online league's points**: the same rules as a live league (best X−1 events, `computeLeaguePoints`), or different?
- **The player page's stats filter**: left for later.
- **1C's "top black bar"**: see above.
- **Leghe & Eventi**: does the online league sit in "In corso" next to the live one and the Topdeck series (as the mockup's B assumed), in what order, and how does it look in the Archivio?

## Suggested order

1. The migration (`type`, `players.endstep`), then the code moved from `is_topdeck` to `type`, with no visible change.
2. The admin: league type picker ("Lega / Topdeck / Online"), and the player's endstep username field.
3. The marks: the league card (1C), the Bacheca event (2B), the history's logo, the recap heading.
4. The Bacheca's standings tabs (two open leagues).
5. The "Dove" filter on the Meta pages.
6. Live-only badges, card cosmetics and achievements.
7. The docs updated for each step (docs/data-model.md's `leagues` row, docs/pages.md, the filter in docs/ui.md).
