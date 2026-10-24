"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//"))
    return "/dashboard";
  return next;
}

export default function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const linkError = params.get("error");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>(
    linkError ? { kind: "error", message: linkError } : { kind: "idle" },
  );

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setState({ kind: "sending" });
    const { error } = await createClient().auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: redirectTo() },
    });
    setState(
      error
        ? { kind: "error", message: error.message }
        : { kind: "sent", email: value },
    );
  }

  async function google() {
    setState({ kind: "sending" });
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) setState({ kind: "error", message: error.message });
  }

  if (state.kind === "sent") {
    return (
      <div
        className="rounded-card border border-line bg-surface p-6"
        role="status"
      >
        <p className="text-lg font-medium text-ink">Check your inbox.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          We sent a sign-in link to{" "}
          <span className="font-medium text-ink">{state.email}</span>. It works
          once and expires in an hour.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-5 text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  const busy = state.kind === "sending";

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={sendLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@yourcompany.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-13 rounded-field border border-line bg-surface px-5 text-base text-ink placeholder:text-muted/70 outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-13 rounded-field bg-ink px-5 text-base font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={google}
        disabled={busy}
        className="flex h-13 items-center justify-center gap-3 rounded-field border border-line bg-surface px-5 text-base font-medium text-ink transition-colors hover:border-muted disabled:opacity-50"
      >
        <GoogleMark />
        Continue with Google
      </button>

      {state.kind === "error" ? (
        <p className="text-sm text-bad" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
