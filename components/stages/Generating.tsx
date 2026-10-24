"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";

import SplitView from "@/components/SplitView";
import { useGenerate } from "@/hooks/useGenerate";
import { describeStreamProgress } from "@/lib/html-stream";
import type {
  GenerateRequest,
  InterviewAnswers,
  Report,
  Score,
  Theme,
} from "@/lib/types";

interface GeneratingProps {
  report: Report;
  answers: InterviewAnswers;
  theme: Theme;
  selectedFindingIds: string[];
  onComplete(html: string, score: Score | null): void;
}

export default function Generating({
  report,
  answers,
  theme,
  selectedFindingIds,
  onComplete,
}: GeneratingProps) {
  const reduce = useReducedMotion();
  const request = useMemo<GenerateRequest>(
    () => ({
      reportId: report.id,
      claimToken: report.claimToken,
      answers,
      theme,
      selectedFindingIds,
      report: {
        url: report.url,
        title: report.title,
        productFacts: report.productFacts,
        uniqueness: report.uniqueness,
        findings: report.findings,
        metrics: report.metrics,
        score: report.score,
      },
    }),
    [report, answers, theme, selectedFindingIds],
  );
  const runKey = `${report.id}:${theme.name}:${selectedFindingIds.join(",")}`;
  const gen = useGenerate(request, runKey);

  const completed = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!gen.done || gen.error || completed.current || !gen.html.trim()) return;
    // Let the last section land before the stage changes.
    const id = setTimeout(
      () => {
        completed.current = true;
        onCompleteRef.current(gen.html, gen.score);
      },
      reduce ? 0 : 900,
    );
    return () => clearTimeout(id);
  }, [gen.done, gen.error, gen.html, gen.score, reduce]);

  const status = gen.error
    ? "Something went wrong"
    : gen.done
      ? gen.score
        ? `Done. New slop score: ${Math.round(gen.score.total)}`
        : gen.truncated
          ? "Done, but the new score didn't arrive"
          : "Done"
      : gen.scoring
        ? "Checking the new page against the doctrine…"
        : gen.revised
          ? "Tightening a few spots…"
          : describeStreamProgress(gen.html);

  return (
    <div className="flex w-full flex-1 flex-col max-md:p-0 md:h-[calc(100dvh-var(--header-h))] md:px-6 md:pb-4 md:pt-2">
      <div className="mx-auto mb-4 hidden w-full max-w-[1800px] items-center justify-between gap-4 md:flex">
        <div className="flex min-w-0 items-center gap-3">
          <Pulse active={!gen.done} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={status}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="truncate text-lg text-ink"
              aria-live="polite"
            >
              {status}
            </motion.p>
          </AnimatePresence>
        </div>
        <p className="shrink-0 text-sm text-muted">
          {theme.name} · {selectedFindingIds.length} fixes
        </p>
      </div>

      {gen.error ? (
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-start justify-center gap-5 px-5 py-12">
          <h2 className="text-3xl font-semibold text-ink">
            The page did not finish.
          </h2>
          <p className="text-lg text-muted">{gen.error}</p>
          <button
            type="button"
            onClick={() => {
              completed.current = false;
              gen.retry();
            }}
            className="h-12 rounded-full bg-ink px-6 font-semibold text-bg"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col">
          <SplitView
            originalSrc={report.snapshotUrl}
            originalScreenshots={report.screenshots}
            newHtml={gen.html}
            streaming={!gen.done}
            originalScore={report.score.total}
            newScore={gen.score?.total ?? null}
            mobileOverlay={
              <div className="m-3 flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-bg shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]">
                <Pulse active={!gen.done} />
                <span className="truncate">{status}</span>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}

function Pulse({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
      {active && (
        <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-accent" />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${active ? "bg-accent" : "bg-good"}`}
      />
    </span>
  );
}
