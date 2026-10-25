// Server-only persistence for reports and everything hanging off them.
// With Supabase configured: Postgres (service role) + private Storage bucket.
// Without it: an in-memory store on globalThis, so local dev needs zero setup.

import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { screenshotMime } from "@/lib/types";
import type {
  Capture,
  FiveSecondTest,
  Finding,
  InterviewAnswers,
  Metrics,
  Report,
  Score,
  UniquenessSignal,
} from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabase } from "@/lib/supabase/server";
import type { Json } from "./types";

if (typeof window !== "undefined") {
  throw new Error("lib/db/reports is server-only.");
}

const BUCKET = "captures";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReportInput = Omit<
  Report,
  "id" | "screenshots" | "snapshotUrl" | "claimToken"
>;

export interface ReportListItem {
  id: string;
  url: string;
  title: string;
  score: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

function snapshotUrl(id: string): string {
  return `/api/snapshot/${id}`;
}

function toJson(value: unknown): Json {
  return value as Json;
}

function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

interface MemoryReport {
  report: Omit<Report, "claimToken">;
  claimTokenHash: string;
  snapshot: string;
  userId: string | null;
  createdAt: string;
}

interface MemoryStore {
  reports: Map<string, MemoryReport>;
  interviews: Map<string, InterviewAnswers>;
}

const globalStore = globalThis as typeof globalThis & {
  __deslopMemoryStore?: MemoryStore;
};

function memory(): MemoryStore {
  globalStore.__deslopMemoryStore ??= {
    reports: new Map(),
    interviews: new Map(),
  };
  return globalStore.__deslopMemoryStore;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function saveReport(input: {
  report: ReportInput;
  capture: Capture;
}): Promise<Report> {
  const { report, capture } = input;
  const id = randomUUID();
  const claimToken = newClaimToken();
  const claimTokenHash = hashToken(claimToken);

  if (!hasSupabase()) {
    const stored: MemoryReport["report"] = {
      ...report,
      id,
      screenshots: {
        desktop: `data:${screenshotMime(capture.desktop)};base64,${capture.desktop.screenshot}`,
        mobile: `data:${screenshotMime(capture.mobile)};base64,${capture.mobile.screenshot}`,
      },
      snapshotUrl: snapshotUrl(id),
    };
    memory().reports.set(id, {
      report: stored,
      claimTokenHash,
      snapshot: capture.snapshotHtml,
      userId: null,
      createdAt: new Date().toISOString(),
    });
    return { ...stored, claimToken };
  }

  const supabase = createAdminClient();
  const ext = (vp: Capture["desktop"]) =>
    screenshotMime(vp) === "image/jpeg" ? "jpg" : "png";
  const paths = {
    desktop: `${id}/desktop.${ext(capture.desktop)}`,
    mobile: `${id}/mobile.${ext(capture.mobile)}`,
    snapshot: `${id}/snapshot.html`,
  };

  const uploads = await Promise.all([
    supabase.storage
      .from(BUCKET)
      .upload(
        paths.desktop,
        Buffer.from(capture.desktop.screenshot, "base64"),
        {
          contentType: screenshotMime(capture.desktop),
          upsert: true,
        },
      ),
    supabase.storage
      .from(BUCKET)
      .upload(paths.mobile, Buffer.from(capture.mobile.screenshot, "base64"), {
        contentType: screenshotMime(capture.mobile),
        upsert: true,
      }),
    supabase.storage
      .from(BUCKET)
      .upload(paths.snapshot, Buffer.from(capture.snapshotHtml, "utf8"), {
        contentType: "text/html",
        upsert: true,
      }),
  ]);
  const uploadError = uploads.find((u) => u.error)?.error;
  if (uploadError) {
    throw new Error(`Could not store the page capture: ${uploadError.message}`);
  }

  const { error } = await supabase.from("reports").insert({
    id,
    claim_token_hash: claimTokenHash,
    url: report.url,
    title: report.title,
    score: Math.round(report.score.total),
    score_detail: toJson(report.score),
    metrics: toJson(report.metrics),
    findings: toJson(report.findings),
    uniqueness: toJson(report.uniqueness),
    five_second: toJson(report.fiveSecond),
    product_facts: toJson(report.productFacts),
    desktop_screenshot_path: paths.desktop,
    mobile_screenshot_path: paths.mobile,
    snapshot_path: paths.snapshot,
  });
  if (error) throw new Error(`Could not save the report: ${error.message}`);

  const screenshots = await signScreenshots(paths.desktop, paths.mobile);
  return {
    ...report,
    id,
    screenshots,
    snapshotUrl: snapshotUrl(id),
    claimToken,
  };
}

async function signScreenshots(
  desktopPath: string | null,
  mobilePath: string | null,
): Promise<Report["screenshots"]> {
  const wanted = [desktopPath, mobilePath].filter((p): p is string => !!p);
  if (wanted.length === 0) return { desktop: "", mobile: "" };
  const { data } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrls(wanted, SIGNED_URL_TTL);
  const byPath = new Map(
    (data ?? []).map((d) => [d.path ?? "", d.signedUrl ?? ""]),
  );
  return {
    desktop: desktopPath ? (byPath.get(desktopPath) ?? "") : "",
    mobile: mobilePath ? (byPath.get(mobilePath) ?? "") : "",
  };
}

export async function getReport(id: string): Promise<Report | null> {
  if (!isUuid(id)) return null;

  if (!hasSupabase()) {
    return memory().reports.get(id)?.report ?? null;
  }

  const { data: row, error } = await createAdminClient()
    .from("reports")
    .select(
      "id, url, title, score_detail, metrics, findings, uniqueness, five_second, product_facts, desktop_screenshot_path, mobile_screenshot_path",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return null;

  return {
    id: row.id,
    url: row.url,
    title: row.title,
    score: row.score_detail as unknown as Score,
    metrics: row.metrics as unknown as Metrics,
    findings: row.findings as unknown as Finding[],
    uniqueness: row.uniqueness as unknown as UniquenessSignal[],
    fiveSecond: row.five_second as unknown as FiveSecondTest | null,
    productFacts: row.product_facts as unknown as string[],
    screenshots: await signScreenshots(
      row.desktop_screenshot_path,
      row.mobile_screenshot_path,
    ),
    snapshotUrl: snapshotUrl(row.id),
  };
}

export async function getSnapshot(id: string): Promise<string | null> {
  if (!isUuid(id)) return null;

  if (!hasSupabase()) {
    return memory().reports.get(id)?.snapshot ?? null;
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("reports")
    .select("snapshot_path")
    .eq("id", id)
    .maybeSingle();
  if (!row?.snapshot_path) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(row.snapshot_path);
  if (error || !data) return null;
  return data.text();
}

// ---------------------------------------------------------------------------
// Interview
// ---------------------------------------------------------------------------

export async function saveInterview(
  reportId: string,
  answers: InterviewAnswers,
): Promise<void> {
  if (!isUuid(reportId)) return;

  if (!hasSupabase()) {
    if (memory().reports.has(reportId)) {
      memory().interviews.set(reportId, answers);
    }
    return;
  }

  const { error } = await createAdminClient()
    .from("interviews")
    .upsert({ report_id: reportId, answers: toJson(answers) });
  if (error) throw new Error(`Could not save the interview: ${error.message}`);
}

/** Saved answers for a report. Callers check authorship before showing them. */
export async function getInterview(
  reportId: string,
): Promise<InterviewAnswers | null> {
  if (!isUuid(reportId)) return null;

  if (!hasSupabase()) {
    return memory().interviews.get(reportId) ?? null;
  }

  const { data, error } = await createAdminClient()
    .from("interviews")
    .select("answers")
    .eq("report_id", reportId)
    .maybeSingle();
  if (error || !data) return null;
  return data.answers as unknown as InterviewAnswers;
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * Attach an anonymous report to a user. Succeeds when the claim token matches
 * and the report is unclaimed (or already this user's). Idempotent.
 */
export async function claimReport(
  reportId: string,
  claimToken: string,
  userId: string,
): Promise<boolean> {
  if (!isUuid(reportId) || !isUuid(userId) || !claimToken) return false;
  const tokenHash = hashToken(claimToken);

  if (!hasSupabase()) {
    const entry = memory().reports.get(reportId);
    if (!entry || !sameHash(entry.claimTokenHash, tokenHash)) return false;
    if (entry.userId && entry.userId !== userId) return false;
    entry.userId = userId;
    return true;
  }

  const { data, error } = await createAdminClient()
    .from("reports")
    .update({ user_id: userId, claimed_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("claim_token_hash", tokenHash)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .select("id");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * May this caller write interview answers for a report?
 * Yes with the report's claim token, or as the signed-in owner of a claimed
 * report. A shared /r/<id> link alone is never enough.
 */
export async function canWriteReport(
  reportId: string,
  claimToken: string | undefined,
  userId: string | null,
): Promise<boolean> {
  if (!isUuid(reportId)) return false;
  const tokenHash = claimToken ? hashToken(claimToken) : null;

  if (!hasSupabase()) {
    const entry = memory().reports.get(reportId);
    if (!entry) return false;
    if (tokenHash && sameHash(entry.claimTokenHash, tokenHash)) return true;
    return !!userId && entry.userId === userId;
  }

  const { data, error } = await createAdminClient()
    .from("reports")
    .select("claim_token_hash, user_id")
    .eq("id", reportId)
    .maybeSingle();
  if (error || !data) return false;
  if (tokenHash && sameHash(data.claim_token_hash, tokenHash)) return true;
  return !!userId && data.user_id === userId;
}

export async function listReportsForUser(
  userId: string,
): Promise<ReportListItem[]> {
  if (!userId) return [];

  if (!hasSupabase()) {
    const store = memory();
    return [...store.reports.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        id: r.report.id,
        url: r.report.url,
        title: r.report.title,
        score: Math.round(r.report.score.total),
        createdAt: r.createdAt,
      }));
  }

  const { data, error } = await createAdminClient()
    .from("reports")
    .select("id, url, title, score, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    url: r.url,
    title: r.title,
    score: r.score,
    createdAt: r.created_at,
  }));
}
