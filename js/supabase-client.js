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

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const isConfigured =
  !SUPABASE_URL.includes("YOUR-PROJECT-REF") && !SUPABASE_ANON_KEY.includes("YOUR-ANON-PUBLIC-KEY");
