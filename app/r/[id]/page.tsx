import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ReportFlow from "@/components/ReportFlow";
import { canWriteReport, getInterview, getReport } from "@/lib/db/reports";
import { getUserId } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Report · Desloper" };

// Reports are addressed by an unguessable uuid, so the link itself is the
// share token. Reads go through the server; a session only matters for the
// owner, who also gets their saved answers back.
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

  // The link is shareable, so saved answers only come back for the owner.
  const userId = await getUserId().catch(() => null);
  const isOwner = userId
    ? await canWriteReport(id, undefined, userId).catch(() => false)
    : false;
  const answers = isOwner ? await getInterview(id) : null;

  return (
    <ReportFlow
      report={report}
      initialAnswers={answers ?? undefined}
      canPersist={isOwner}
    />
  );
}

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-sm text-muted">
      <span className="animate-shimmer">Opening report…</span>
    </div>
  );
}
