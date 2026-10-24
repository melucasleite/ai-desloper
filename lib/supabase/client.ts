import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";
import { supabasePublishableKey, supabaseUrl } from "./env";

export { hasSupabaseAuth } from "./env";

/** Browser client (publishable key only). */
export function createClient() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createBrowserClient<Database>(url, key);
}
