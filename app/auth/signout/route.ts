import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAuth } from "@/lib/supabase/env";

/** POST-only so a stray link or prefetch can't sign anyone out. */
export async function POST(request: NextRequest) {
  if (hasSupabaseAuth()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
