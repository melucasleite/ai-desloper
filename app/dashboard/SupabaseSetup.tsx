/** Shown on /login and /dashboard when Supabase env vars are missing. */
export default function SupabaseSetup() {
  return (
    <div className="rounded-card border border-line bg-surface p-6 text-sm leading-relaxed text-muted">
      <p className="text-base font-medium text-ink">Accounts are off.</p>
      <p className="mt-2">
        Reports live in memory until Supabase is connected. To turn on saving
        and sign-in:
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5">
        <li>
          Run <Code>npx supabase start</Code> for a local stack, or create a
          project and link it.
        </li>
        <li>
          Apply the schema with <Code>npx supabase db push</Code> (local start
          applies it for you).
        </li>
        <li>
          Put <Code>NEXT_PUBLIC_SUPABASE_URL</Code>,{" "}
          <Code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</Code> and{" "}
          <Code>SUPABASE_SECRET_KEY</Code> in <Code>.env.local</Code> (see{" "}
          <Code>.env.example</Code>), then restart the dev server.
        </li>
      </ol>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}
