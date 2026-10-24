import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listReportsForUser } from "@/lib/db/reports";
import { getUser, hasSupabase } from "@/lib/supabase/server";
import SupabaseSetup from "./SupabaseSetup";

export const metadata: Metadata = { title: "Saved reports · Desloper" };

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-10 pb-20 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Saved reports
      </h1>
      {hasSupabase() ? (
        <Suspense fallback={<ListSkeleton />}>
          <ReportList />
        </Suspense>
      ) : (
        <div className="mt-8 max-w-md">
          <SupabaseSetup />
        </div>
      )}
    </main>
  );
}

async function ReportList() {
  const user = await getUser();
  if (!user) redirect("/login?next=/dashboard");

  const reports = await listReportsForUser(user.id);

  return (
    <>
      <div className="mt-2 flex items-center justify-between gap-4 text-sm text-muted">
        <span className="truncate">{user.email ?? "Signed in"}</span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md transition-colors hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>

      {reports.length === 0 ? (
        <div className="mt-10 rounded-card border border-dashed border-line px-6 py-12 text-center">
          <p className="text-lg font-medium text-ink">Nothing saved yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Score a landing page, rebuild it, then hit Save on the comparison.
            It will show up here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-11 items-center rounded-field bg-ink px-5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
          >
            Score a page
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {reports.map((r) => (
            <li key={r.id}>
              <Link
                href={`/r/${r.id}`}
                className="group flex items-center gap-4 py-4 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink group-hover:text-accent">
                    {r.title || hostOf(r.url)}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {hostOf(r.url)} · {formatDate(r.createdAt)}
                  </p>
                </div>
                <ScoreChange from={r.score} to={r.newScore} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ScoreChange({ from, to }: { from: number; to: number | null }) {
  return (
    <p
      className="shrink-0 text-right text-sm tabular-nums"
      aria-label={
        to === null ? `Slop score ${from}` : `Slop score ${from}, now ${to}`
      }
    >
      <span className="font-semibold text-bad">{from}</span>
      {to !== null ? (
        <>
          <span className="mx-1.5 text-muted" aria-hidden>
            →
          </span>
          <span className="font-semibold text-good">{to}</span>
        </>
      ) : (
        <span className="ml-2 text-muted">not rebuilt</span>
      )}
    </p>
  );
}

function ListSkeleton() {
  return (
    <ul className="mt-12 divide-y divide-line border-y border-line" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-4 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 animate-shimmer rounded bg-line" />
            <div className="h-3 w-1/3 animate-shimmer rounded bg-line" />
          </div>
          <div className="h-4 w-14 animate-shimmer rounded bg-line" />
        </li>
      ))}
    </ul>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
