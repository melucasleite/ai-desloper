// A report the visitor asked to save before signing in. /api/save parks it in an
// httpOnly cookie; /auth/callback claims it once the session exists.

export const PENDING_CLAIM_COOKIE = "deslop_pending_claim";
export const PENDING_CLAIM_MAX_AGE = 60 * 60; // 1 hour

export interface PendingClaim {
  reportId: string;
  claimToken: string;
}

export function encodePendingClaim(claim: PendingClaim): string {
  return Buffer.from(JSON.stringify(claim), "utf8").toString("base64url");
}

export function decodePendingClaim(
  raw: string | undefined,
): PendingClaim | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed?.reportId === "string" &&
      typeof parsed?.claimToken === "string"
    ) {
      return { reportId: parsed.reportId, claimToken: parsed.claimToken };
    }
  } catch {
    // Malformed cookie: ignore it.
  }
  return null;
}

/** Only allow same-origin relative paths as post-login destinations. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//"))
    return "/dashboard";
  if (next.startsWith("/\\")) return "/dashboard";
  return next;
}
