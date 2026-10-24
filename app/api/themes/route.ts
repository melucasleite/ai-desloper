import { canWriteReport, saveInterview, saveThemes } from "@/lib/db/reports";
import { parseBody, themesRequestSchema } from "@/lib/generate/schemas";
import { proposeThemes } from "@/lib/generate/themes";
import { rateLimited } from "@/lib/rate-limit";
import { getUserId } from "@/lib/supabase/server";

export const maxDuration = 120;

export async function POST(request: Request) {
  const limited = rateLimited(request, "themes");
  if (limited) return limited;

  const body = await parseBody(request, themesRequestSchema);
  if ("response" in body) return body.response;
  const req = body.data;

  // Anyone holding a shared link can ask for themes, but only the author
  // (claim token or owner session) may overwrite what is stored.
  const canWrite = await canWriteReport(
    req.reportId,
    req.claimToken,
    await getUserId().catch(() => null),
  ).catch(() => false);

  // Persist the interview alongside theme generation; neither save blocks the response on failure.
  const [, themes] = await Promise.all([
    canWrite
      ? saveInterview(req.reportId, req.answers).catch((error: unknown) => {
          console.error("[themes] saveInterview failed", error);
        })
      : null,
    proposeThemes(req),
  ]);

  if (canWrite) {
    try {
      await saveThemes(req.reportId, themes, null);
    } catch (error) {
      console.error("[themes] saveThemes failed", error);
    }
  }

  return Response.json(
    { themes },
    { headers: { "cache-control": "no-store" } },
  );
}
