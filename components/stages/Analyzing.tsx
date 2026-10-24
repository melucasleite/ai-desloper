"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AnalyzeEvent, Box, Score } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import StatusFeed from "@/components/StatusFeed";
import ScanPreview from "@/components/ScanPreview";
import ScoreDial from "@/components/ScoreDial";

interface Props {
  url: string;
  events: AnalyzeEvent[];
  score: Score | null;
  screenshots: Partial<
    Record<
      "desktop" | "mobile",
      { url: string; fullHeight: number; width: number }
    >
  >;
  onContinue(): void;
  /** True once the report is done; the interview may begin earlier. */
  ready: boolean;
}

function deriveState(events: AnalyzeEvent[]) {
  let status = "Starting up";
  let box: Box | null = null;
  let findings = 0;
  let failed: string | null = null;
  for (const ev of events) {
    if (ev.type === "status") {
      status = ev.message;
      if (ev.box) box = ev.box;
    } else if (ev.type === "finding") {
      findings += 1;
      if (ev.finding.boxes[0]) box = ev.finding.boxes[0];
    } else if (ev.type === "error") {
      failed = ev.message;
    }
  }
  return { status, box, findings, failed };
}

export default function Analyzing({
  url,
  events,
  score,
  screenshots,
  onContinue,
  ready,
}: Props) {
  const { status, box, findings, failed } = useMemo(
    () => deriveState(events),
    [events],
  );
  const captured = Boolean(screenshots.mobile || screenshots.desktop);
  const canContinue = ready || (captured && findings >= 1) || findings >= 3;
  const tone = failed ? "error" : ready ? "done" : "working";

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-36 sm:px-8 lg:pb-16">
      <div className="flex justify-center pt-2">
        <StatusPill
          layoutId="url-pill"
          url={url}
          message={ready ? "Read complete" : (failed ?? status)}
          tone={tone}
        />
      </div>

      {/* Phones: a narrow preview beside the feed, so the live numbers stay
          above the fold instead of under a full-height screenshot. */}
      <div className="mt-6 grid flex-1 grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-4 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
        <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1 lg:gap-8">
          <div className="flex items-center gap-3 lg:gap-5">
            <span className="lg:hidden">
              <ScoreDial value={score?.total ?? 0} size={64} />
            </span>
            <span className="max-lg:hidden">
              <ScoreDial value={score?.total ?? 0} size={96} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">
                Slop score
              </p>
              <p className="mt-1 text-[15px] text-ink">
                {score ? (
                  ready ? (
                    <>
                      Grade <span className="font-semibold">{score.grade}</span>
                      . Higher means more generic.
                    </>
                  ) : (
                    "Rising as findings come in."
                  )
                ) : (
                  "Counting once the page renders."
                )}
              </p>
              <p className="mt-0.5 text-sm text-muted tabular-nums">
                {findings} {findings === 1 ? "finding" : "findings"} so far
              </p>
            </div>
          </div>

          <StatusFeed
            events={events}
            className="max-h-[52vh] lg:max-h-[min(58vh,560px)]"
          />
        </div>

        <div className="order-1 flex justify-center lg:order-2 lg:sticky lg:top-8">
          <ScanPreview
            screenshots={screenshots}
            box={box}
            active={!ready && !failed}
            className="max-lg:w-[7.5rem]"
          />
        </div>
      </div>

      <AnimatePresence>
        {canContinue ? (
          <motion.div
            key="continue"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="fixed inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 bg-gradient-to-t from-bg via-bg/90 to-transparent px-5 pt-10 pb-6 lg:static lg:mt-10 lg:bg-none lg:p-0"
          >
            <button
              type="button"
              onClick={onContinue}
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              Tell us your story
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <p className="text-sm text-muted">
              {ready
                ? "Nine short questions. Skip any of them."
                : "The read keeps going while you answer."}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
