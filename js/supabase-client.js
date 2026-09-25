// Supabase project connection.
//
// SETUP (do this once):
// 1. Create a free project at https://supabase.com.
// 2. In the SQL editor, run supabase/schema.sql from this repo.
// 3. In Authentication > Providers, disable public email sign-up so nobody
//    but the admin account(s) you create by hand can ever be "authenticated".
// 4. In Authentication > Users, manually add one admin user (email + password).
// 5. In Project Settings > API, copy the "Project URL" and the "anon public"
//    key below. The anon key is meant to be public in client code — see the
//    Row Level Security policies in schema.sql for the real access control.
//
// This file relies on the Supabase UMD build being loaded first as a plain
// (non-module) <script> tag on every page, which exposes `window.supabase`.

const SUPABASE_URL = "https://avgogarpoqsfzstmputm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1QnaqckaDwM6uKRpls4gbw_z4ktDQgx";

// Public pages must never carry an auth session — the RLS policies show
// open/unpublished events, entries and matches to "authenticated" callers
// (so an admin can preview their own in-progress work), and this file is
// shared by both the admin app and every public page. Without this guard, a
// browser logged into /admin/ would have that same session picked up by the
// public pages too (same origin, same localStorage), making them see
// unpublished data as if they were the admin. Only the admin app persists a
// session at all; public pages always start (and stay) fully anonymous.
const isAdmin = window.location.pathname.includes("/admin/");

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: isAdmin, autoRefreshToken: isAdmin },
});
