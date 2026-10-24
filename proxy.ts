import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  hasSupabaseAuth,
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase/env";

/**
 * Refreshes the Supabase session cookie on every matched request so Server
 * Components (which can't write cookies) always see a fresh token.
 * No-op when Supabase isn't configured. Never redirects: the whole flow
 * works signed out, and protected pages check getClaims() themselves.
 */
export async function proxy(request: NextRequest) {
  if (!hasSupabaseAuth()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl()!,
    supabasePublishableKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Cache headers that keep CDNs from serving one user's cookies to another.
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Don't put code between client creation and getClaims(): it refreshes the token.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Skip static assets, images, and the long-lived streaming/snapshot APIs.
    "/((?!_next/static|_next/image|favicon.ico|api/analyze|api/generate|api/snapshot|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
