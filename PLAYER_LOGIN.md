# Player login — plan and progress

Branch: `player-login`. Work in progress, not on the live site yet. Update the
**Status** column and each step's checklist as work gets done.

## What we're building

- **Open sign-up with Google:** anyone with a Google account can sign in on
  `account.html`; the first sign-in creates their account. No email/password
  for players (decided after Supabase's built-in email sender proved too
  limited: it only emails the project team, a couple of emails per hour).
  With Google, Supabase sends no emails at all — no confirmation, no
  password reset — so no email service is needed. The admin keeps its own
  email/password login in `/admin/`.
- **Claiming a player:** a signed-in user asks to be linked to an existing
  player (with all its history). The **admin approves or rejects** the
  request. Until then the request grants nothing.
- **Own profile:** once linked, the user can edit their own player's profile
  (which fields: see *Open questions*).
- **Admin "Utenti" tab:** list of users (email, sign-up date, last login,
  linked player, status) and pending claim requests. The admin can approve or
  reject requests, change or remove a link at any time, block/unblock and
  delete users.

**Dropped:** sending decklists by email. No email service and no Supabase
Edge Functions are needed: the admin's user management runs through
admin-only database functions protected by `is_admin()`.

**Accepted trade-off:** with open sign-up anyone can create an account, but
an account alone can't change any data. Claims need admin approval, and the
admin can block or delete accounts.

## Steps

| # | Step | Status |
|---|---|---|
| 0 | Admins vs signed-in users | Done on **dev**, committed (`96435a7`), **not on live** |
| 1 | Accounts (sign in with Google, logout) | Done on **dev**, **not on live** |
| 2 | Claim a player (request side; approval UI is step 3) | Done on **dev**, **not on live** |
| 3 | Admin "Utenti" tab | Done on **dev**, **not on live** |
| 4 | Profile page ("Profilo") | Done on **dev**, **not on live** |
| 5 | Go live | To do |

## Setup: the dev database

Running the site locally (`localhost` / `127.0.0.1`), `js/supabase-client.js`
connects to the **dcp-dev** Supabase project (URL contains
`xylxqwufckkyzrgtfbxi`) instead of live. Local testing never touches real
data. Start the local site with `python -m http.server 8000` from the repo
folder, then open http://localhost:8000/ (admin: http://localhost:8000/admin/).

Database changes go in `supabase/migrations/` (numbered, each with a
rollback) **and** are folded into `supabase/schema.sql`, which stays the
from-scratch setup. Run migrations in the Supabase SQL editor: dev first,
live only at step 5.

## Step 0 — Admins vs signed-in users

**Why:** every database rule used to treat "signed in" as "admin". That was
only safe while the admin was the only account. Now "admin" means listed in
the `admins` table, checked by `is_admin()`.

Done:

- [x] `supabase/migrations/001_admins.sql` (+ `001_admins_rollback.sql`): the
  `admins` table, `is_admin()`, and all 34 admin rules switched from
  `auth.role() = 'authenticated'` to `is_admin()`. Committed in `c90e64f`.
- [x] Run on **dev**. Checked with:
  ```sql
  select to_regclass('public.admins'), to_regprocedure('public.is_admin()'),
    (select count(*) from pg_policies
      where qual like '%is_admin%' or with_check like '%is_admin%');
  -- expected: admins | is_admin() | 34
  ```
- [x] Admin account added to `admins` on dev; admin login and saving tested
  locally, still works.
- [x] Admin app refuses non-admin accounts: `admin/js/auth.js`'s `isAdmin()`
  asks the database, `admin/js/app.js`'s `handleSession` shows the admin only
  if it says yes, otherwise keeps the login form with "… non è un account
  amministratore." (since step 1 it no longer signs the account out: the
  session is shared with the public site). Tested on dev with a non-admin test account
  (`giocatore.test@example.com`, created in dcp-dev → Authentication → Users,
  not in `admins`).
  - Note: `onAuthChange` defers its callback with `setTimeout`, because
    supabase-js freezes if another Supabase call is awaited inside its own
    auth-change callback.
- [x] `supabase/schema.sql` updated (the `admins` table + `is_admin()`, all
  rules use it).
- [x] `CLAUDE.md` updated (RLS line: `is_admin()`, the migrations convention,
  the dev database).

- [x] Committed in `96435a7`.

Left:

- [ ] On **live**: done at step 5 (see there).

## Step 1 — Accounts

- [x] **dcp-dev dashboard:** Authentication → Sign In / Providers, User
  Signups section: **Allow new users to sign up** on — the section has its
  own Save button (missing it gives "Signups not allowed for this instance").
  This switch covers Google sign-ins too. The Email provider stays enabled
  for the admin's own login. Authentication → URL Configuration: Site URL
  `http://localhost:8000`, Redirect URLs `http://localhost:8000/**` and
  `http://127.0.0.1:8000/**`.
- [x] **Google OAuth client** (Google Cloud Console, console.cloud.google.com,
  free — no billing account needed), one for both projects:
  1. Create a Google Cloud project (e.g. "Duel Commander Piacenza").
  2. Google Auth Platform (APIs & Services → OAuth consent screen):
     app name, support email, Audience **External**. To let anyone sign in,
     **publish** it ("In production"); in "Testing" only the listed test
     users can. Only the basic scopes (email, profile) are used, which need
     no Google review.
  3. Clients → Create client → **Web application**. Authorized redirect URIs:
     `https://xylxqwufckkyzrgtfbxi.supabase.co/auth/v1/callback` (dev) and
     `https://avgogarpoqsfzstmputm.supabase.co/auth/v1/callback` (live).
  4. Copy the Client ID and Client secret (kept by Michele, not in the repo).
  - Done: project created, consent screen (External, still in **Testing**),
    client with both redirect URIs.
  - While in Testing, other Google accounts must be listed under Audience →
    Test users to sign in.
- [x] **dcp-dev dashboard:** Authentication → Sign In / Providers → **Google**:
  enable, paste the Client ID and secret, save. Callback URL confirmed.
- [x] **Code:** `js/supabase-client.js` keeps a login session on every page
  now (public pages were deliberately anonymous before, because "signed in"
  meant "admin"; step 0 made that safe). One session for the whole site:
  the admin app no longer signs out a non-admin account, it just shows
  "… non è un account amministratore." (signing out would also log the
  player out of the public site).
  - Consequence, accepted: the admin browsing the public site while logged
    in sees unpublished events there (they pass `is_admin()`).
- [x] **Code:** `account.html` + `js/account-page.js`: "Accedi con Google"
  button (Google comes back to `account.html`), signed-in view with the
  email and "Esci". `.form-message` moved from `admin/admin.css` to
  `styles.css` (shared). An earlier email/password version (sign-up,
  confirmation, reset) was tested and then replaced by Google.
  - Tested on dev with the test account: login, the session shared with
    the admin (refused there, still logged in on the site), logout.
- [x] **Test Google sign-in on dev:** works. Michele's Gmail is the same
  email as the admin account, so Supabase attached the Google sign-in to it
  (Providers: "Email, Google") — signing in with that Google account is the
  admin. Player tests need a second Google account (added under Google
  Auth Platform → Audience → Test users while the app is in Testing);
  the admin's own account can also claim a player like anyone else, which
  is how steps 2-3 were tested. (`giocatore.test@example.com` was deleted
  in step 3; to test the admin's refusal at `/admin/` again, recreate a
  non-admin account in dcp-dev → Authentication → Users.)
- [x] **Code:** an account button in the public header, after the search,
  in all 13 public pages (`#site-account` → `account.html`), driven by
  `js/header-account.js`: person icon when signed out, Google profile
  picture when signed in. On phones (≤480px) the title "Duel Commander
  Piacenza" shrinks with the screen width to make room.
- [x] **Test the header button** on desktop and phone: works (picture when
  signed in, icon after "Esci", opens the account page; phone header fits).

Note: with sign-up allowed and the Email provider on (for the admin), an
email sign-up through Supabase's API is still technically possible, but it
needs a confirmation email that the built-in sender won't deliver, so such
an account can never sign in. No email form is offered on the site.

## Step 2 — Claim a player, with admin approval

- [x] Migration `002_player_claims.sql` (+ rollback), **run on dev**:
  `players.user_id` (the link, unique, written only by the admin via the
  existing `players_admin_update` policy) and `player_claims` (pending
  requests: one per account, one per player; users read only their own).
  Folded into `schema.sql`. Note: `players` is publicly readable, so
  `user_id` (an internal id, nothing personal) is too — needed to list the
  players still free.
- [x] Database functions for the user: `request_player_claim(player)` (checks
  every rule, errors are codes: not_signed_in, already_linked,
  request_pending, player_not_found, player_taken, player_requested) and
  `cancel_player_claim()`. Signed-in accounts only. No direct write
  permission on either table.
- [x] `js/db.js`'s `PlayerClaims` + `account.html` "Il tuo giocatore": the
  linked player (link to its page), or the pending request with "Annulla
  richiesta", or a searchable list of the players not yet linked with
  "Invia richiesta".
- [x] **Test on dev:** request, cancel, request again, approved by hand
  (SQL below), linked view ("Il tuo account è collegato a Michele Ferri.")
  — all working. On dev, Michele's account (also the admin) is now linked
  to the player "Michele Ferri".
- Approving/rejecting comes with the admin tab (step 3). Until then a
  request can be approved by hand in the SQL editor (dev only — this
  approves **every** pending request):
  ```sql
  update players set user_id = c.user_id from player_claims c where players.id = c.player_id;
  delete from player_claims;
  ```

## Step 3 — Admin "Utenti" tab

- [x] Migration `003_admin_users.sql` (+ rollback), **run on dev**, folded
  into `schema.sql`. Admin-only functions (`security definer`, each checks
  `is_admin()` first, else raises `not_admin` — verified from the SQL
  editor, which isn't an admin): `admin_list_users()`,
  `admin_approve_claim(user)`, `admin_reject_claim(user)`,
  `admin_set_user_player(user, player or null)` (can move a player from
  another account), `admin_set_user_blocked(user, bool)`,
  `admin_delete_user(user)` (the player stays, just unlinked). Admin
  accounts can't be blocked or deleted through them (`admin_account`).
  - Block = Supabase Auth's ban date, 100 years ahead, plus deleting the
    account's saved sessions: no new sign-in, signed out at the latest when
    the current access token expires (up to about an hour).
- [x] `js/db.js`'s `AdminUsers` + admin tab **"Utenti"**
  (`admin/js/users-admin.js`): pending requests on top (Approva / Rifiuta);
  below, the accounts (email, dates, linked player or
  pending request, Attivo/Bloccato toggle — "Admin" for admin accounts,
  ✕ to delete) with a search, and a "Collega a un giocatore" form (✎ on a
  row, searchable player list, "— nessun giocatore —" unlinks; moving a
  player already linked elsewhere asks for confirmation).
- [x] **Test on dev:** list, link / unlink via the form, block / unblock,
  approve and reject a request (made from account.html), delete (refused
  on the admin's own row; the test account `giocatore.test@example.com`
  was deleted) — all working. The "Admin" pill is green, same size as
  Attivo/Bloccato; the sign-in method column was dropped (players always
  use Google).

## Step 4 — Profile page

Decided: `account.html` becomes **"Profilo"**, laid out like a profile page
on other sites. The player's own name/handle stay with the admin; the user
edits a profile of their own instead: description, favourite colours,
favourite commander, favourite archetype.

- [x] Migration `004_profiles.sql` (+ rollback), **run on dev**, folded into
  `schema.sql`: `profiles`, one row per **account** (not per player — it's
  there before any claim is approved, and follows the person if the admin
  moves the player link). `description` ≤ 500 chars, `fav_colors` a
  WUBRG-ordered string ('' = none, checked by the database),
  `fav_commander_id`, `fav_archetype`. Plain RLS: only the owner inserts /
  updates, the owner and the admin read. Not public yet.
- [x] `js/db.js`'s `Profiles` (`mine`, `save` = upsert).
- [x] `account.html` + `js/account-page.js` rewritten:
  - **player card** (left on desktop; replaced an earlier "cover + avatar"
    profile header and a separate edit card): Magic-card proportions
    (488:680), but a game-style player card inside, not a Magic card's
    layout. The favourite commander's **art** (Scryfall `art_crop`, front
    face, cached) fills it, darkening towards the bottom; no commander → a
    colour glow with the logo. **Not credited on the card**, by Michele's
    choice — Scryfall's guidelines do ask for the artist to be credited
    where its art crops are shown (it was in the footer before). Border: a
    glowing **gradient of the favourite colours** (one colour → that colour
    into a darker shade; none → silver). The upper part of the card is left
    to the art alone. Below it, straight on the art (no box behind it): a
    **nameplate** (small avatar with a ring in the card's colour — the Google picture;
    hidden by the owner → **no circle at all** outside edit mode; no Google
    picture → the initial on red — and the name beside it: the linked
    player's, else the Google name); then a frosted-glass panel at the
    bottom with archetype | colours side by side
    (label + value), then the
    description (**140 characters at most**, migration 006). The favourite
    commander isn't written on the card — it *is* the art. Footer:
    **"Dal <year>"** of the linked player's first event (not the
    account's), and the logo. Always dark, the same in both themes; sized in
    `cqw` so it scales as one piece;
  - **✎ edits without changing the layout**: each value becomes editable
    in its place — archetype becomes a list, the colour pips toggles, the
    description editable text (0/140, fixed size, can't be resized), plus
    a "Commander preferito (sfondo)" list that appears only in edit mode
    and a "Mostra foto" switch under the name (`profiles.show_avatar`,
    migration 005). Border, art, pips and avatar preview live. ✎ itself
    becomes ✓ (save), with ✕ beside it (or Esc) to cancel. The card grows
    taller in edit mode if needed. The switch is animated both ways, as one
    motion (the glass panel's contents fade out, the panel grows/shrinks
    carrying the nameplate, the contents fade back in; ✕ slides out from under ✓, the
    icons turn into each other). On desktop the card is exactly as tall as
    the stats + Account cards beside it (its width follows their height,
    the switch under it counted);
    on phones it's 300px wide;
  - "Il tuo giocatore" card (the step 2 claim) **at the top, only while the
    account isn't linked** (no request yet, or one waiting) — tinted red, to
    invite a new account to claim its player first; hidden once linked. Its
    player list's dropdown is lifted above the cards below while open;
  - "Le tue statistiche" card, **only once linked**, right of the player
    card on desktop: the player page's own winrate tiles (Winrate, Eventi,
    Vittorie, Pareggi, Sconfitte — same counting as `player-detail.js`,
    whole history) plus **Miglior piazzamento** as one more tile of the same
    look (from the cached `event_standings`), and a "Pagina giocatore →"
    link. ("Commander più giocato" was dropped);
  - "Account" card, under the stats: the Google login as one row (logo,
    email, "Esci"), then **"Elimina account"** — not shown to admin
    accounts. `delete_my_account()` (migration 006) deletes the auth user:
    its profile and pending request go with it, its player is unlinked and
    kept; refused for admins in the database too. After it, the page goes
    back to the sign-in card ("Account eliminato…"); signing in with Google
    again creates a new, empty account;
  - the page stays behind its loading splash until profile, claim,
    commanders and the admin check are loaded, then fades in together;
  - ≤820px: one column, the player card first and centred; phones: stat
    tiles two per row.
- Header search on phones: the ✕ of the open search sits where the
  header's search button was — no longer the last button since the account
  button — so the field now reserves room for it based on its real position
  (`html.nav-mobile .site-search-bar`'s padding-right), instead of running
  under it.
- [x] **Test on dev** (earlier header layout): saving the profile, stats
  when linked (same numbers as the player page), the claim card on top
  when not linked, the Account card and "Esci", phone and dark mode — all
  working.
- [x] **Migrations 005 and 006 run on dev** (`005_profile_show_avatar.sql`,
  `006_short_description_delete_account.sql`); saving the card works.
- [ ] **Test the player card, account deletion and the phone search on
  dev** (layout tests before going live).

### The card on the player page

- [x] Migration `007_public_player_card.sql` (+ rollback), folded into
  `schema.sql` — **to run on dev**: `profiles.show_on_player_page` (default
  on) and `public_player_card(p_player_id)`, a security-definer function
  everyone can call, returning the card of the account linked to that
  player — nothing if the player isn't linked, the account never saved its
  card (no `profiles` row before the first save), its owner hides it, or
  the account is blocked. `profiles` itself stays private. The Google
  picture comes from the account's sign-in data, only when shown on the
  card.
- [x] `player.html`: the card (view only, `js/player-card.js`'s
  `renderPublicPlayerCard`, the account page's own colours/art/markup
  helpers moved there too) placed and sized like `commander.html`'s card —
  beside the title from its top down to the stat tiles' bottom on desktop
  (≤320px wide; the five stat tiles fit on one row beside it, so it comes
  out the commander card's size), the filters beside it fading instead of
  collapsing;
  stacked below the title on phones. "Dal <year>" from the player's first
  event.
- [x] `account.html`: a "Mostra la carta nella pagina giocatore" switch
  under the player card (once linked), saved right away; disabled (label "Salva
  prima la tua carta almeno una volta.") until the card has been saved once. Card + switch
  together are as tall as the stats + Account cards beside them.
- [ ] **Run 007 on dev and test**: a linked account with a saved card →
  card on its player page; switch off → gone; never saved → no card,
  switch disabled; a player with no account → page as before.

### Badges on the card

- [x] The linked player's badges (manual slots, then automatic by priority —
  the same as next to the name on the player page) in the card's top-left
  corner, on both account.html and player.html: small discs in `main`'s
  badge look (white, red ring — the lighter red, the card being dark) drawn
  by the card itself (`js/player-card.js`'s `cardBadgesHtml`, `.pc-badges`),
  with the site-wide hover text. account.html loads them with the stats
  (`Players.get` + `PlayerAutoBadges.listByPlayer`); no badges when not
  linked. **After merging `main`** (5.1): its badges revamp draws badges
  differently (`badgeDiscHtml`, `.badge-disc`) — the card's discs copy its
  look already; check them with the new icons, and switch them to
  `badgeDiscHtml` if simpler.

### Sign-in card

- [x] "Entra con il tuo account Google." plus what an account is for (link
  to your player and your stats, your own player card, showing it on your
  player page), and under "Accedi con Google" a muted line on what Google
  shares (name, email, photo). A full privacy page was tried and dropped.

## Step 5 — Go live

Database first, code second: the new code calls tables and functions
(`admins`/`is_admin()`, `profiles`, `public_player_card()`, …) that don't
exist on live until the migrations run, while the current live code keeps
working with them already in place (the admin account is in `admins` from
001 on, so its saves still pass `is_admin()`). In order:

### 5.1 — Bring `main` into `player-login` (code, no live impact)

`main` moved on while this branch was open. Merge it **into the branch**
first, so any surprise shows up here, tested on dev, never on the live site.

```
git checkout player-login
git fetch origin
git merge origin/main
```

State when last checked (2026-10-05, branch commit `0eae990`):

- `main` had 16 commits not on the branch (tables restyle, admin event
  pages, badges revamp with `icons/badges/*.svg` and `js/info-dialog.js`,
  foil card styles, …); the branch 7.
- Changed on both sides: `CLAUDE.md`, `admin/admin.css`, `admin/index.html`,
  `admin/js/app.js`, `js/player-detail.js`, `matchups.html`, `social.html`,
  `styles.css`. A dry run (`git merge-tree --write-tree --name-only HEAD
  origin/main`, changes nothing) merged all but two by itself:
  - **`js/player-detail.js`**: `main` made `init()` start its three
    requests at once (`playerRequest = Players.get(id)`,
    `autoBadgesRequest`, `entriesRequest`, awaited later in order) and
    turned the title's badges into plain icons (`badgeDiscHtml`); the
    branch changed the same `const player = await Players.get(id)` into a
    `Promise.all` with `PlayerCards.get(id)`. Resolve by keeping `main`'s
    version and adding the card as a fourth request started alongside the
    others — `const cardRequest = PlayerCards.get(id).catch((err) => {
    console.error(err); return null; });` (not fatal: the page works without
    it), then `const card = await cardRequest;` — and keep the branch's card
    block after `const entries = await entriesRequest;`, its imports
    (`PlayerCards`, `renderPublicPlayerCard`, `fitTitleToOneLine`,
    `alignBackButtonToTitle`), `syncPlayerCardLayout()` and its call at the
    end of `applyFilters()`.
  - **`CLAUDE.md`**: documentation only, both sides added text — keep both.
- No silent problems found: `main` added no public page (a new page would
  lack the header's account button, `#site-account`, added to every public
  page on this branch), nothing on `main` uses the CSS names this branch
  renamed (`.commander-filter-panel` → `.detail-filter-panel`,
  `#commander-winrate` in those rules → `.detail-filter-panel + .stat-grid`,
  `--commander-filters-shift` → `--detail-filters-shift`), and `main`
  changed nothing under `supabase/`.

**If `main` has moved again since**, redo the dry run first, and check its
new commits for exactly those three things: new public pages (copy the
`#site-account` header markup into them), uses of the old CSS names, and
database changes (a `main` migration would need numbering after 007 and
running too).

- [x] Merge `origin/main` into `player-login`, conflicts resolved (`main` had
  17 commits by then, the last adding `backup/` table exports): the two
  expected conflicts, `js/player-detail.js` resolved as above (the card a
  fourth request beside `main`'s three) and `CLAUDE.md` (each page row from
  the side that changed it); checked after — the admin app's "Utenti" tab
  and admin check, `js/moxfield.js`'s new path in social.html, the account
  button on every public page, no old CSS names left.
- [ ] Test locally on dev (`python -m http.server 8000`): `main`'s new
  features and the whole player login together — sign-in, claim, admin
  "Utenti", profile card (edit, save, switch), the card on player.html,
  commander.html's card and filters (renamed CSS), phone and dark mode.
- [ ] Commit the merge on `player-login`.

### 5.2 — Live database and settings

- [ ] **Back up the live database** first (Supabase dashboard).
- [ ] Live SQL editor: run `001_admins.sql`, then add the admin account:
  ```sql
  insert into admins (user_id) select id from auth.users where email = '...';
  ```
  Check with the step 0 query above (expects 34), and that the admin still
  saves on the live site. Then the later migrations, in order, each checked
  like on dev: `002_player_claims.sql`, `003_admin_users.sql`,
  `004_profiles.sql`, `005_profile_show_avatar.sql`,
  `006_short_description_delete_account.sql`, `007_public_player_card.sql`.
  (Each has a `_rollback.sql` if one goes wrong.)
- [ ] Live dashboard: the step 1 settings — Allow new users to sign up, the
  Google provider (same Client ID and secret; the live callback URL is
  already in the Google client), and the live site's address as Site URL /
  Redirect URLs (`https://duelcommanderpiacenza.github.io/**`).
- [ ] Google client: published ("In production"), so anyone can sign in.

Publishing the Google client turned out to need, under **Google Auth
Platform → Branding**: an app name, a support email, a **home page URL**
(`https://duelcommanderpiacenza.github.io`), a **privacy policy URL**
(`https://duelcommanderpiacenza.github.io/privacy.html`) and the authorized
domain `duelcommanderpiacenza.github.io`. So `privacy.html` came back (it
had been dropped earlier), with its contact email, linked again from the
sign-in card's Google line — and the code went
live first (5.3), so that page exists before Google is given its address.

### 5.3 — Code live

- [ ] Merge `player-login` into `main` (`git checkout main`, `git merge
  player-login` — no conflicts expected after 5.1) and push: GitHub Pages
  publishes it.
- [ ] On the live site: sign in with Google; the admin app still works for
  the admin account; a player page with no linked account looks as before.

### Still to decide

- [ ] Google Analytics (index.html, social.html — there before this
  feature): as configured it sets cookies without asking; under the Italian
  Garante's rules analytics cookies like these need prior consent (a cookie
  banner), unless GA is removed or set up not to. Decide before/at go-live.

## Open questions

- None right now. (Step 4's "which fields can a player edit" was answered:
  a profile of the account's own — description, favourite colours,
  commander, archetype — instead of the player's name/handle.)
