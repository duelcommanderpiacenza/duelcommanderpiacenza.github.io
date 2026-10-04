# Player login — plan and progress

Branch: `player-login`. Work in progress, not on the live site yet. Update the
**Status** column and each step's checklist as work gets done.

## What we're building

- **Open sign-up:** anyone can create an account (email + password, with email
  confirmation).
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
| 0 | Admins vs signed-in users | Done on **dev**, code ready to commit, **not on live** |
| 1 | Accounts (sign-up, login, logout, password reset) | To do |
| 2 | Claim a player, with admin approval | To do |
| 3 | Admin "Utenti" tab | To do |
| 4 | Own profile editing | To do — waiting on an open question |
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
  if it says yes, otherwise signs the account out with "Questo account non è
  un amministratore." Tested on dev with a non-admin test account
  (`giocatore.test@example.com`, created in dcp-dev → Authentication → Users,
  not in `admins`).
  - Note: `onAuthChange` defers its callback with `setTimeout`, because
    supabase-js freezes if another Supabase call is awaited inside its own
    auth-change callback.
- [x] `supabase/schema.sql` updated (the `admins` table + `is_admin()`, all
  rules use it).
- [x] `CLAUDE.md` updated (RLS line: `is_admin()`, the migrations convention,
  the dev database).

Left:

- [ ] **Commit** the step 0 code: `admin/js/auth.js`, `admin/js/app.js`,
  `supabase/schema.sql`, `CLAUDE.md` (and this file).
- [ ] On **live**: done at step 5 (see there).

## Step 1 — Accounts

- [ ] **You, dcp-dev dashboard:** Authentication → Providers → Email: allow
  new users to sign up, keep **Confirm email** on. Set the redirect URLs for
  email confirmation and password reset (Authentication → URL
  Configuration) so local testing works (`http://localhost:8000/...`).
- [ ] **Code:** `js/supabase-client.js` currently never keeps a login session
  outside `/admin/` (public pages were deliberately anonymous, because
  "signed in" used to mean "admin"). Step 0 made sessions safe, so public
  pages can keep one. Update that file's comments too: its setup notes still
  say to disable public sign-up.
- [ ] **Code:** sign-up / login / logout / forgotten password, and an
  "Account" entry in the public header. The nav markup is duplicated in every
  public HTML page (see CLAUDE.md), so a header change touches all of them.
- [ ] Keep in mind: an admin also browsing the public site while logged in
  will see unpublished events there (they pass `is_admin()`). Acceptable, or
  decide otherwise in this step.

## Step 2 — Claim a player, with admin approval

- [ ] Migration `002_...`: a `user_id` link on `players` (one account per
  player, set **only** by the admin), and a pending-requests table (one
  pending request per user; a player can't be requested by two users at
  once).
- [ ] Database functions for the user: request a player, cancel own request,
  see own request/link. No broad write permission on `players`.
- [ ] Public "Account" page: pick a player not yet linked, send the request,
  show "in attesa di approvazione" until the admin acts, then the linked
  player.

## Step 3 — Admin "Utenti" tab

- [ ] Admin-only database functions (`security definer`, checking
  `is_admin()`): list users with email, sign-up date, last login, linked
  player and status; approve/reject requests; set/change/remove a link;
  block/unblock; delete.
  - Block = setting the user's ban date in Supabase Auth. It stops new logins
    at once, but an already logged-in user keeps access until their current
    session expires (up to about an hour).
- [ ] New admin tab "Utenti": pending requests at the top, user list below.

## Step 4 — Own profile

- [ ] **Open question:** which fields can a player edit? Proposal: only the
  handle. The name appears in every result and standing, so changing it stays
  with the admin.
- [ ] A database function that lets a user edit only their own linked
  player, only those fields.
- [ ] Edit form on the Account page.

## Step 5 — Go live

- [ ] Live SQL editor: run `001_admins.sql`, then add the admin account:
  ```sql
  insert into admins (user_id) select id from auth.users where email = '...';
  ```
  Check with the step 0 query above (expects 34), and that the admin still
  saves. Then the later migrations, in order.
- [ ] Live dashboard: the step 1 sign-up settings, with the live site's
  redirect URLs.
- [ ] Merge `player-login` into `main`.

## Open questions

- Step 4: which profile fields a player can edit (proposal: handle only).
