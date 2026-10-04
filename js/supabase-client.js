// Supabase project connection.
//
// SETUP (do this once):
// 1. Create a free project at https://supabase.com.
// 2. In the SQL editor, run supabase/schema.sql from this repo.
// 3. In Authentication > Users, manually add the admin user (email +
//    password), then add it to the admins table (see schema.sql, "admins").
// 4. Players sign in with Google: in Authentication > Sign In / Providers,
//    allow new users to sign up and enable the Google provider (with a Google
//    OAuth client), and in Authentication > URL Configuration set the site's
//    address as Site URL / Redirect URL — see PLAYER_LOGIN.md, step 1.
// 5. In Project Settings > API, copy the "Project URL" and the "anon public"
//    key below. The anon key is meant to be public in client code — see the
//    Row Level Security policies in schema.sql for the real access control.
//
// This file relies on the Supabase UMD build being loaded first as a plain
// (non-module) <script> tag on every page, which exposes `window.supabase`.

// Two projects: the live one, and "dcp-dev" (a copy for development, safe to
// break) used whenever the site runs locally — so local testing can never
// touch live data, and a page served from anywhere else always gets the
// live one.
const LIVE = {
  url: "https://avgogarpoqsfzstmputm.supabase.co",
  key: "sb_publishable_1QnaqckaDwM6uKRpls4gbw_z4ktDQgx",
};
const DEV = {
  url: "https://xylxqwufckkyzrgtfbxi.supabase.co",
  key: "sb_publishable_P_G-uZDqWhIws94jnWYMhQ_njOyG7qr",
};
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = isLocal ? DEV : LIVE;

// One login session for the whole site (same origin, same localStorage):
// players sign in on the public pages (account.html), the admin in /admin/.
// Safe since the RLS policies grant extra rights only to is_admin() (the
// admins table), not to every signed-in account — a player's session reads
// exactly what an anonymous visitor does. The admin's own session does show
// unpublished events on the public pages too, if they browse them signed in.
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
