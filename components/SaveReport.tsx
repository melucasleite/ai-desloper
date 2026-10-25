"use client";

import Link from "next/link";
import { useState } from "react";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "auth" }
  | { kind: "error"; message: string };

/** Attaches an anonymous report to the signed-in account via /api/save. */
export default function SaveReport({
  reportId,
  claimToken,
}: {
  reportId: string;
  claimToken: string;
}) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  const save = async () => {
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId, claimToken }),
      });
      if (res.status === 401) return setState({ kind: "auth" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return setState({
          kind: "error",
          message: data.error ?? "Could not save.",
        });
      }
      setState({ kind: "saved" });
    } catch {
      setState({ kind: "error", message: "Could not reach the server." });
    }
  };

  const base =
    "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors";

  if (state.kind === "auth") {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/r/${reportId}`)}`}
        className={`${base} border border-accent text-accent`}
      >
        Sign in to save
      </Link>
    );
  }
  if (state.kind === "saved") {
    return (
      <Link href="/dashboard" className={`${base} text-good`}>
        Saved · Dashboard
      </Link>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={save}
        disabled={state.kind === "saving"}
        className={`${base} border border-line text-ink hover:border-ink/40 disabled:opacity-50`}
      >
        {state.kind === "saving" ? "Saving…" : "Save report"}
      </button>
      {state.kind === "error" && (
        <span className="text-sm text-bad" role="alert">
          {state.message}
        </span>
      )}
    </span>
  );
}
