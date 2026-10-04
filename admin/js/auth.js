import { sb } from "../../js/supabase-client.js";

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await sb.auth.signOut();
}

// Being signed in no longer means being the admin (players can sign up too):
// the database's own is_admin() — the same check every RLS policy uses —
// decides who gets into this app.
export async function isAdmin() {
  const { data, error } = await sb.rpc("is_admin");
  if (error) throw error;
  return data === true;
}

// Deferred with setTimeout: supabase-js deadlocks if another Supabase call
// (like isAdmin above) is awaited inside its own onAuthStateChange callback.
export function onAuthChange(callback) {
  sb.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => callback(session), 0);
  });
}
