"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import Prompt from "@/components/stages/Prompt";
import Results from "@/components/stages/Results";
import type { InterviewAnswers, Report } from "@/lib/types";

export type ReportView = "results" | "prompt";

interface ReportFlowProps {
  report: Report;
  /** Controlled view; leave out to let the flow keep its own. */
  view?: ReportView;
  onViewChange?(view: ReportView): void;
  initialAnswers?: InterviewAnswers;
  onAnswersChange?(answers: InterviewAnswers): void;
  /** True when this viewer may save answers (author or signed-in owner). */
  canPersist: boolean;
  /** "Analyze another page"; goes home when left out. */
  onRestart?(): void;
}

// Opacity only, like the stages on the home page.
const viewMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] },
} as const;

/** Results, then the fix prompt. Shared by the live flow and saved reports. */
export default function ReportFlow({
  report,
  view: controlledView,
  onViewChange,
  initialAnswers,
  onAnswersChange,
  canPersist,
  onRestart,
}: ReportFlowProps) {
  const router = useRouter();
  const [ownView, setOwnView] = useState<ReportView>("results");
  const view = controlledView ?? ownView;
  const setView = (next: ReportView) => {
    setOwnView(next);
    onViewChange?.(next);
  };

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(report.findings.map((f) => f.id)),
  );
  const [answers, setAnswers] = useState<InterviewAnswers>(
    initialAnswers ?? {},
  );

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={view}
          {...viewMotion}
          className="flex w-full flex-1 flex-col"
        >
          {view === "results" ? (
            <Results
              report={report}
              selected={selected}
              onSelectedChange={setSelected}
              onContinue={() => setView("prompt")}
            />
          ) : (
            <Prompt
              report={report}
              selected={selected}
              answers={answers}
              onAnswersChange={(next) => {
                setAnswers(next);
                onAnswersChange?.(next);
              }}
              canPersist={canPersist}
              onBack={() => setView("results")}
              onRestart={onRestart ?? (() => router.push("/"))}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
