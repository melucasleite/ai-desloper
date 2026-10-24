// Supabase env resolution. Supports both the newer publishable/secret key names
// and the legacy anon/service_role names (what the Vercel integration syncs).
// NEXT_PUBLIC_* must be read as literal property accesses so Next can inline them.

export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabasePublishableKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

/** Server only. Never exposed through a NEXT_PUBLIC_ variable. */
export function supabaseSecretKey(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    undefined
  );
}

/** Enough config for auth (browser + cookie session). Safe to call anywhere. */
export function hasSupabaseAuth(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}
