import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db/types";
import {
  hasSupabaseAuth,
  supabasePublishableKey,
  supabaseSecretKey,
  supabaseUrl,
} from "./env";

/**
 * True when the app is fully wired to Supabase: URL, publishable key and the
 * server secret key. When false, persistence falls back to memory and auth is off.
 */
export function hasSupabase(): boolean {
  return hasSupabaseAuth() && Boolean(supabaseSecretKey());
}

/**
 * Cookie-based client for Server Components, Route Handlers and Server Actions.
 * Create one per request.
 */
export async function createClient() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) throw new Error("Supabase is not configured.");
  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, which can't write cookies.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/** Verified user id from the session JWT (getClaims), or null when signed out. */
export async function getUserId(): Promise<string | null> {
  if (!hasSupabaseAuth()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

/** Verified user id + email for display. */
export async function getUser(): Promise<{
  id: string;
  email: string | null;
} | null> {
  if (!hasSupabaseAuth()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const email =
    typeof data.claims.email === "string" ? data.claims.email : null;
  return { id: data.claims.sub, email };
}
