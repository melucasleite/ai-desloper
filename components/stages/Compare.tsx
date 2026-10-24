"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import SplitView, { useIsMobile } from "@/components/SplitView";
import type { Report, Score } from "@/lib/types";

interface CompareProps {
  report: Report;
  html: string;
  newScore: Score | null;
  onRegenerate?(): void;
  onEditFindings?(): void;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "auth" }
  | { kind: "error"; message: string };

const spring = { type: "spring", stiffness: 320, damping: 30 } as const;

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "page"
  );
}

export default function Compare({
  report,
  html,
  newScore,
  onRegenerate,
  onEditFindings,
}: CompareProps) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const reduce = useReducedMotion();

  const download = () => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    let name = report.title;
    try {
      name = name || new URL(report.url).hostname;
    } catch {
      /* keep title */
    }
    a.download = `${slug(name)}-deslopped.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const saveReport = async () => {
    setSave({ kind: "saving" });
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          claimToken: report.claimToken,
        }),
      });
      if (res.status === 401) return setSave({ kind: "auth" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return setSave({
          kind: "error",
          message: data.error ?? "Could not save.",
        });
      }
      setSave({ kind: "saved" });
    } catch {
      setSave({ kind: "error", message: "Could not reach the server." });
    }
  };

  const actions = (
    <ActionBar
      copied={copied}
      save={save}
      canSave={!!report.claimToken}
      reportId={report.id}
      onDownload={download}
      onCopy={copy}
      onSave={saveReport}
      onRegenerate={onRegenerate}
      onEditFindings={onEditFindings}
      stacked={isMobile}
    />
  );

  return (
    <div className="flex w-full flex-col md:h-[calc(100dvh-var(--header-h))] md:px-6 md:pb-4 md:pt-2">
      {!isMobile && (
        <div className="mx-auto mb-4 flex w-full max-w-[1800px] flex-wrap items-center justify-between gap-4">
          <Celebration from={report.score.total} to={newScore?.total ?? null} />
          {actions}
        </div>
      )}
      <div className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col">
        <SplitView
          originalSrc={report.snapshotUrl}
          originalScreenshots={report.screenshots}
          newHtml={html}
          originalScore={report.score.total}
          newScore={newScore?.total ?? null}
          mobileOverlay={
            <div className="m-3 flex items-center justify-between gap-2 rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-bg shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]">
              <Celebration
                from={report.score.total}
                to={newScore?.total ?? null}
                compact
              />
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="h-9 rounded-full bg-bg px-4 text-sm font-semibold text-ink"
              >
                Actions
              </button>
            </div>
          }
        />
      </div>

      <AnimatePresence>
        {isMobile && sheetOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close actions"
              className="fixed inset-0 z-[60] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-label="Actions"
              className="fixed inset-x-0 bottom-0 z-[61] rounded-t-3xl border-t border-line bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
              initial={reduce ? { opacity: 0 } : { y: "100%" }}
              animate={reduce ? { opacity: 1 } : { y: 0 }}
              exit={reduce ? { opacity: 0 } : { y: "100%" }}
              transition={spring}
              drag={reduce ? false : "y"}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => info.offset.y > 80 && setSheetOpen(false)}
            >
              <div
                className="mx-auto mb-5 h-1 w-10 rounded-full bg-line"
                aria-hidden
              />
              <div className="mb-5">
                <Celebration
                  from={report.score.total}
                  to={newScore?.total ?? null}
                />
              </div>
              {actions}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionBar({
  copied,
  save,
  canSave,
  reportId,
  onDownload,
  onCopy,
  onSave,
  onRegenerate,
  onEditFindings,
  stacked,
}: {
  copied: boolean;
  save: SaveState;
  canSave: boolean;
  reportId: string;
  onDownload(): void;
  onCopy(): void;
  onSave(): void;
  onRegenerate?(): void;
  onEditFindings?(): void;
  stacked: boolean;
}) {
  const next = encodeURIComponent(`/r/${reportId}`);
  return (
    <div
      className={
        stacked ? "grid grid-cols-2 gap-2" : "flex flex-wrap items-center gap-2"
      }
    >
      <ActionButton onClick={onDownload} primary>
        Download HTML
      </ActionButton>
      <ActionButton onClick={onCopy}>{copied ? "Copied" : "Copy"}</ActionButton>
      {onRegenerate && (
        <ActionButton onClick={onRegenerate}>Regenerate</ActionButton>
      )}
      {onEditFindings && (
        <ActionButton onClick={onEditFindings}>Edit fixes</ActionButton>
      )}
      {canSave &&
        (save.kind === "auth" ? (
          <Link
            href={`/login?next=${next}`}
            className="flex h-11 items-center justify-center rounded-full border border-accent px-5 text-sm font-semibold text-accent"
          >
            Sign in to save
          </Link>
        ) : save.kind === "saved" ? (
          <Link
            href="/dashboard"
            className="flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-good"
          >
            Saved · Dashboard
          </Link>
        ) : (
          <ActionButton onClick={onSave} disabled={save.kind === "saving"}>
            {save.kind === "saving" ? "Saving…" : "Save"}
          </ActionButton>
        ))}
      {save.kind === "error" && (
        <span
          className={`text-sm text-bad ${stacked ? "col-span-2" : ""}`}
          role="alert"
        >
          {save.message}
        </span>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: ReactNode;
  onClick(): void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={spring}
      className={`h-11 rounded-full px-5 text-sm font-semibold transition-colors disabled:opacity-50 ${
        primary
          ? "bg-ink text-bg"
          : "border border-line text-ink hover:border-ink/40"
      }`}
    >
      {children}
    </motion.button>
  );
}

/** Spring count from the old score down to the new one, then a quiet line. */
function Celebration({
  from,
  to,
  compact,
}: {
  from: number;
  to: number | null;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const value = useSpring(reduce || to === null ? (to ?? from) : from, {
    stiffness: 40,
    damping: 16,
  });
  const display = useTransform(value, (v) => Math.round(v).toString());

  useEffect(() => {
    if (to === null) return;
    if (reduce) value.jump(to);
    else {
      const id = setTimeout(() => value.set(to), 350);
      return () => clearTimeout(id);
    }
  }, [to, reduce, value]);

  const fromR = Math.round(from);
  const toR = to === null ? null : Math.round(to);
  const drop = toR === null ? 0 : fromR - toR;
  const line =
    toR === null
      ? "The new page could not be re-scored."
      : drop > 0
        ? `${drop} points less slop.`
        : `Scored ${toR}, up from ${fromR}. Try another direction.`;

  if (compact) {
    return (
      <span className="flex items-center gap-2 text-sm tabular-nums">
        <span className="opacity-60 line-through">{fromR}</span>
        <span aria-hidden className="opacity-60">
          →
        </span>
        <motion.span className="font-semibold text-good">
          {toR === null ? "–" : display}
        </motion.span>
      </span>
    );
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay: 0.1 }}
      className="flex items-baseline gap-4"
      aria-live="polite"
    >
      <span className="flex items-baseline gap-3 text-4xl font-semibold tabular-nums tracking-tight">
        <span className="text-muted line-through decoration-2">{fromR}</span>
        <span className="text-2xl text-muted" aria-hidden>
          →
        </span>
        <motion.span
          className={drop > 0 || toR === null ? "text-good" : "text-bad"}
        >
          {toR === null ? "–" : display}
        </motion.span>
      </span>
      <motion.span
        initial={reduce ? false : { opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...spring, delay: reduce ? 0 : 1.1 }}
        className="text-base text-muted"
      >
        {line}
      </motion.span>
    </motion.div>
  );
}
