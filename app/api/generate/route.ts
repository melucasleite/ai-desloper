import { canWriteReport } from "@/lib/db/reports";
import { streamPage } from "@/lib/generate/page";
import { generateRequestSchema, parseBody } from "@/lib/generate/schemas";
import { rateLimited } from "@/lib/rate-limit";
import { getUserId } from "@/lib/supabase/server";

export const maxDuration = 300;

/** Streams the generated page. Protocol documented at the top of lib/generate/page.ts. */
export async function POST(request: Request) {
  const limited = rateLimited(request, "generate");
  if (limited) return limited;

  const body = await parseBody(request, generateRequestSchema);
  if ("response" in body) return body.response;

  // Only the author may append a generation (it becomes what /r/<id> shows);
  // anyone else still gets the page, it just isn't stored.
  const persist = await canWriteReport(
    body.data.reportId,
    body.data.claimToken,
    await getUserId().catch(() => null),
  ).catch(() => false);

  return new Response(
    streamPage(body.data, { signal: request.signal, persist }),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        // Ask proxies not to buffer so sections arrive as they are written.
        "x-accel-buffering": "no",
      },
    },
  );
}
