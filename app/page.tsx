"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
} from "motion/react";
import type { InterviewAnswers, Stage } from "@/lib/types";
import { useAnalyze } from "@/hooks/useAnalyze";
import Idle from "@/components/stages/Idle";
import Analyzing from "@/components/stages/Analyzing";
import ReportFlow from "@/components/ReportFlow";

// Opacity only: a transform here would drag the shared url-pill morph with it.
const stageMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] },
} as const;

/** A beat on "Read complete" before the results replace the feed. */
const RESULTS_DELAY_MS = 900;

export default function Home() {
  const analysis = useAnalyze();
  const [stage, setStage] = useState<Stage>("idle");
  const [url, setUrl] = useState("");
  const [answers, setAnswers] = useState<InterviewAnswers>({});

  const { report, error, start } = analysis;

  // A failed read sends us back to the input with the error under the field.
  const failed = Boolean(error) && !report;
  const view: Stage = failed && stage === "analyzing" ? "idle" : stage;

  useEffect(() => {
    if (view === "idle" || view === "analyzing") window.scrollTo({ top: 0 });
  }, [view]);

  // Results show as soon as the report exists, whether or not the judge ran.
  useEffect(() => {
    if (stage !== "analyzing" || !report) return;
    const id = setTimeout(() => setStage("results"), RESULTS_DELAY_MS);
    return () => clearTimeout(id);
  }, [stage, report]);

  const begin = useCallback(
    (next: string) => {
      // Re-reading the same page keeps what the founder already typed.
      if (next !== url) setAnswers({});
      setUrl(next);
      setStage("analyzing");
      void start(next);
    },
    [start, url],
  );

  let content: React.ReactNode;
  let key: string = view;

  switch (view) {
    case "idle":
      content = <Idle onSubmit={begin} error={failed ? error : null} />;
      break;

    case "analyzing":
      content = (
        <Analyzing
          url={url}
          events={analysis.events}
          score={analysis.score}
          screenshots={analysis.screenshots}
          ready={Boolean(report)}
        />
      );
      break;

    case "results":
    case "prompt":
      // One key for both views so the selection and answers survive the switch.
      key = `report-${report?.id ?? "none"}`;
      content = report ? (
        <ReportFlow
          report={report}
          view={view}
          onViewChange={setStage}
          initialAnswers={answers}
          onAnswersChange={setAnswers}
          canPersist={Boolean(report.claimToken)}
          onRestart={() => setStage("idle")}
        />
      ) : null;
      break;
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <main className="relative flex flex-1 flex-col">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={key}
              {...stageMotion}
              className="flex w-full flex-1 flex-col"
            >
              {content}
            </motion.div>
          </AnimatePresence>
        </main>
      </LayoutGroup>
    </MotionConfig>
  );
}
