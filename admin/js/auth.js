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

export function onAuthChange(callback) {
  sb.auth.onAuthStateChange((_event, session) => callback(session));
}
