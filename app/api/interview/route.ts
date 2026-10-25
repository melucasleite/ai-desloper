import { canWriteReport, saveInterview } from "@/lib/db/reports";
import { interviewSaveSchema, parseBody } from "@/lib/generate/schemas";
import { rateLimited } from "@/lib/rate-limit";
import { getUserId } from "@/lib/supabase/server";

export const maxDuration = 30;

const noStore = { "cache-control": "no-store" };

/** Saves the optional "Make it yours" answers for a report. Author only. */
export async function POST(request: Request) {
  const limited = rateLimited(request, "interview");
  if (limited) return limited;

  const body = await parseBody(request, interviewSaveSchema);
  if ("response" in body) return body.response;
  const { reportId, claimToken, answers } = body.data;

  const canWrite = await canWriteReport(
    reportId,
    claimToken,
    await getUserId().catch(() => null),
  ).catch(() => false);
  if (!canWrite) {
    return Response.json(
      { error: "Only the author of this report can save answers." },
      { status: 403, headers: noStore },
    );
  }

  try {
    await saveInterview(reportId, answers);
  } catch (error) {
    console.error("[interview] save failed", error);
    return Response.json(
      { error: "Could not save your answers." },
      { status: 500, headers: noStore },
    );
  }
  return new Response(null, { status: 204, headers: noStore });
}
