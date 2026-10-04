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
  - profile header card: red cover band, the Google picture as a big
    avatar overlapping it (initial on red if none), "Modifica profilo",
    name, the description as bio, and four facts (Giocatore
    — linked, or requested "in attesa" —, Colori preferiti as pips,
    Commander preferito, Archetipo preferito);
  - "Modifica profilo" card, hidden until opened: colour swatches, a
    searchable commander list, the archetypes as their coloured pills,
    description with a 0/500 counter; Salva / Annulla;
  - "Il tuo giocatore" card (the step 2 claim) **at the top, only while the
    account isn't linked** (no request yet, or one waiting) — tinted red, to
    invite a new account to claim its player first; hidden once linked;
  - "Le tue statistiche" card, **only once linked**, under the profile (and
    the edit card): the player page's own winrate tiles (Winrate, Eventi,
    Vittorie, Pareggi, Sconfitte — same counting as `player-detail.js`,
    whole history), most played commander, best placement (from the cached
    `event_standings`), and a "Pagina giocatore →" link;
  - "Account" card, last: the Google email it's signed in with, and "Esci";
  - the page stays behind its loading splash until profile, claim and
    commanders are loaded, then fades in together (cards one beat apart);
  - phones: avatar, name, buttons and bio centred, facts and stat tiles
    two per row;
    dark mode: the cover stays red, the avatar ring takes the page colour.
- [x] **Test on dev:** saving the profile, stats when linked (same numbers
  as the player page), the claim card on top when not linked, the Account
  card and "Esci", phone and dark mode — all working (phone stat tiles
  fixed to two per row).

Possible later: showing the profile on the public player page
(`player.html`) of the linked player — would need a public read rule on
`profiles` for linked accounts.

## Step 5 — Go live

- [ ] Live SQL editor: run `001_admins.sql`, then add the admin account:
  ```sql
  insert into admins (user_id) select id from auth.users where email = '...';
  ```
  Check with the step 0 query above (expects 34), and that the admin still
  saves. Then the later migrations, in order, each checked like on dev:
  `002_player_claims.sql`, `003_admin_users.sql`, `004_profiles.sql`.
- [ ] Live dashboard: the step 1 settings — Allow new users to sign up, the
  Google provider (same Client ID and secret; the live callback URL is
  already in the Google client), and the live site's address as Site URL /
  Redirect URLs (`https://duelcommanderpiacenza.github.io/**`).
- [ ] Google client: published ("In production"), so anyone can sign in.
- [ ] Merge `player-login` into `main`.

## Open questions

- None right now. (Step 4's "which fields can a player edit" was answered:
  a profile of the account's own — description, favourite colours,
  commander, archetype — instead of the player's name/handle.)
