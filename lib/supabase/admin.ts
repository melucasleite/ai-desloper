import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { supabaseSecretKey, supabaseUrl } from "./env";

if (typeof window !== "undefined") {
  throw new Error("lib/supabase/admin must never be imported in the browser.");
}

/**
 * Service-role client. Bypasses RLS: server-side only, and always filter
 * by an id you have already authorized.
 */
export function createAdminClient() {
  const url = supabaseUrl();
  const key = supabaseSecretKey();
  if (!url || !key) throw new Error("Supabase service key is not configured.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
