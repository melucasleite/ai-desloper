import { cookies } from "next/headers";
import { claimReport } from "@/lib/db/reports";
import { getUserId, hasSupabase } from "@/lib/supabase/server";
import {
  PENDING_CLAIM_COOKIE,
  PENDING_CLAIM_MAX_AGE,
  encodePendingClaim,
} from "@/lib/supabase/pending-claim";

/**
 * POST { reportId, claimToken }
 *   200 { ok: true, url: "/r/<id>" }            saved to the signed-in account
 *   401 { error, loginUrl }                     signed out; the claim is parked
 *                                               in a cookie and completed after
 *                                               sign-in by /auth/callback
 *   403 { error }                               token mismatch / owned by someone else
 *   503 { error }                               Supabase not configured
 */
export async function POST(request: Request) {
  let body: { reportId?: unknown; claimToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : "";
  if (!reportId || !claimToken) {
    return Response.json(
      { error: "reportId and claimToken are required." },
      { status: 400 },
    );
  }

  if (!hasSupabase()) {
    return Response.json(
      {
        error:
          "Saving needs Supabase. Add the Supabase keys to .env.local to turn on accounts.",
      },
      { status: 503 },
    );
  }

  const userId = await getUserId();
  if (!userId) {
    const cookieStore = await cookies();
    cookieStore.set(
      PENDING_CLAIM_COOKIE,
      encodePendingClaim({ reportId, claimToken }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: PENDING_CLAIM_MAX_AGE,
      },
    );
    const next = `/r/${reportId}`;
    return Response.json(
      {
        error: "Sign in to save this report.",
        loginUrl: `/login?next=${encodeURIComponent(next)}`,
      },
      { status: 401 },
    );
  }

  const ok = await claimReport(reportId, claimToken, userId);
  if (!ok) {
    return Response.json(
      { error: "This report can't be saved to your account." },
      { status: 403 },
    );
  }
  return Response.json({ ok: true, url: `/r/${reportId}` });
}
