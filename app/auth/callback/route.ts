import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { claimReport } from "@/lib/db/reports";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { hasSupabaseAuth } from "@/lib/supabase/env";
import {
  PENDING_CLAIM_COOKIE,
  decodePendingClaim,
  safeNextPath,
} from "@/lib/supabase/pending-claim";

/**
 * Lands here from a magic link (?code= with PKCE, or ?token_hash=&type=)
 * or from Google OAuth (?code=). Exchanges for a session cookie, completes
 * any pending "save this report" claim, then sends the user on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const failed = (message: string) =>
    NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`,
    );

  if (!hasSupabaseAuth()) return NextResponse.redirect(`${origin}/`);

  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) return failed(providerError);

  const supabase = await createClient();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed("That sign-in link has expired. Try again.");
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) return failed("That sign-in link has expired. Try again.");
  } else {
    return failed("Sign-in didn't complete. Try again.");
  }

  const cookieStore = await cookies();
  const pending = decodePendingClaim(
    cookieStore.get(PENDING_CLAIM_COOKIE)?.value,
  );
  if (pending && hasSupabase()) {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) {
      await claimReport(pending.reportId, pending.claimToken, data.claims.sub);
    }
  }
  if (pending) cookieStore.delete(PENDING_CLAIM_COOKIE);

  return NextResponse.redirect(`${origin}${next}`);
}
