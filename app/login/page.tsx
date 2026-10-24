import type { Metadata } from "next";
import { Suspense } from "react";
import { hasSupabaseAuth } from "@/lib/supabase/env";
import SupabaseSetup from "@/app/dashboard/SupabaseSetup";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Desloper" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-start justify-center px-5 pt-[12vh] pb-16">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Keep your reports.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Sign in to save a report and its rebuilt page, and come back to them
          later. Everything else works without an account.
        </p>
        <div className="mt-8">
          {hasSupabaseAuth() ? (
            <Suspense fallback={<div className="h-56" aria-hidden />}>
              <LoginForm />
            </Suspense>
          ) : (
            <SupabaseSetup />
          )}
        </div>
      </div>
    </main>
  );
}
