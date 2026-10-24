import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Compare from "@/components/stages/Compare";
import ScoreDial from "@/components/ScoreDial";
import { getLatestGeneration, getReport } from "@/lib/db/reports";
import type { Report } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Report · Desloper" };

// Reports are addressed by an unguessable uuid, so the link itself is the
// share token. Reads go through the server; nothing here needs a session.
export default function ReportPage({ params }: Params) {
  return (
    <main className="flex w-full flex-1 flex-col">
      <Suspense fallback={<Loading />}>
        <ReportView params={params} />
      </Suspense>
    </main>
  );
}

async function ReportView({ params }: Params) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();

  const generation = await getLatestGeneration(id);
  if (generation) {
    return (
      <Compare
        report={report}
        html={generation.html}
        newScore={generation.score}
      />
    );
  }
  return <Summary report={report} />;
}

function Summary({ report }: { report: Report }) {
  const worst = [...report.findings]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-10 pb-20 sm:px-8">
      <div className="flex items-center gap-6">
        <ScoreDial value={report.score.total} label="Slop score" size={112} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">
            {report.title || report.url}
          </h1>
          <p className="mt-1 truncate text-sm text-muted">{report.url}</p>
          <p className="mt-3 text-sm text-muted">
            Grade {report.score.grade} · {report.findings.length} findings · not
            rebuilt yet
          </p>
        </div>
      </div>

      {worst.length > 0 ? (
        <ul className="mt-10 space-y-3">
          {worst.map((f) => (
            <li
              key={f.id}
              className="rounded-card border border-line bg-surface px-5 py-4"
            >
              <p className="font-medium text-ink">{f.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {f.detail}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <Link
        href="/"
        className="mt-10 inline-flex h-11 items-center rounded-field bg-ink px-5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
      >
        Score another page
      </Link>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-sm text-muted">
      <span className="animate-shimmer">Opening report…</span>
    </div>
  );
}

function severityRank(s: Report["findings"][number]["severity"]): number {
  return s === "high" ? 2 : s === "medium" ? 1 : 0;
}
