"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
} from "motion/react";
import type { InterviewAnswers, Score, Stage, Theme } from "@/lib/types";
import { useAnalyze } from "@/hooks/useAnalyze";
import Idle from "@/components/stages/Idle";
import Analyzing from "@/components/stages/Analyzing";
import Interview from "@/components/stages/Interview";
import Findings from "@/components/stages/Findings";
import Generating from "@/components/stages/Generating";
import Compare from "@/components/stages/Compare";
import StatusPill from "@/components/StatusPill";
import ScoreDial from "@/components/ScoreDial";

// Opacity only: a transform here would drag the shared url-pill morph with it.
const stageMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] },
} as const;

export default function Home() {
  const analysis = useAnalyze();
  const [stage, setStage] = useState<Stage>("idle");
  const [url, setUrl] = useState("");
  const [answers, setAnswers] = useState<InterviewAnswers>({});
  const [theme, setTheme] = useState<Theme | null>(null);
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([]);
  const [html, setHtml] = useState("");
  const [newScore, setNewScore] = useState<Score | null>(null);
  const [generation, setGeneration] = useState(0);

  const { report, error, start } = analysis;

  // An analysis that fails before producing a report sends us back to the
  // input, but only from the analyzing screen: mid-interview the answers stay
  // put and the pill offers to retry the read instead.
  const failed = Boolean(error) && !report;
  const view: Stage = failed && stage === "analyzing" ? "idle" : stage;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  const begin = useCallback(
    (next: string) => {
      // Re-reading the same page keeps what the founder already typed.
      if (next !== url) setAnswers({});
      setUrl(next);
      setTheme(null);
      setSelectedFindingIds([]);
      setHtml("");
      setNewScore(null);
      setStage("analyzing");
      void start(next);
    },
    [start, url],
  );

  const retryRead = () => void start(url);
  const retryButton = failed ? (
    <button
      type="button"
      onClick={retryRead}
      className="h-9 rounded-full bg-ink px-4 text-sm font-semibold text-bg"
    >
      Retry the read
    </button>
  ) : null;

  const deslop = (chosen: Theme, ids: string[]) => {
    setTheme(chosen);
    setSelectedFindingIds(ids);
    setGeneration((g) => g + 1);
    setStage("generating");
  };

  const complete = (out: string, score: Score | null) => {
    setHtml(out);
    setNewScore(score);
    setStage("compare");
  };

  const pillMessage = report
    ? `Slop score ${report.score.total}`
    : failed
      ? (error ?? "The read failed")
      : (analysis.status ?? "Reading the page");
  const pillTone = failed ? "error" : report ? "done" : "working";

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
          onContinue={() => setStage("interview")}
          ready={Boolean(report)}
        />
      );
      break;

    case "interview":
      content = (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-center gap-3 px-5 pt-2">
            <StatusPill
              layoutId="url-pill"
              url={url}
              message={pillMessage}
              tone={pillTone}
            />
            {retryButton}
          </div>
          <Interview
            report={report}
            answers={answers}
            onChange={setAnswers}
            onDone={() => setStage("findings")}
          />
        </div>
      );
      break;

    case "findings":
      if (!report) {
        key = "findings-wait";
        content = (
          <section className="flex flex-1 flex-col items-center justify-center gap-8 px-5 pb-[12vh] text-center">
            <StatusPill
              layoutId="url-pill"
              url={url}
              message={pillMessage}
              tone={pillTone}
            />
            <ScoreDial value={analysis.score?.total ?? 0} label="Slop score" />
            {failed ? (
              <div className="flex flex-col items-center gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">The read stopped</h2>
                  <p className="mt-2 text-muted">
                    Your answers are safe. Try the read again and they will
                    still be here.
                  </p>
                </div>
                {retryButton}
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-semibold">Finishing the read</h2>
                <p className="mt-2 text-muted">
                  Your answers are in. A few more seconds and the findings are
                  ready.
                </p>
              </div>
            )}
          </section>
        );
      } else {
        content = (
          <Findings report={report} answers={answers} onDeslop={deslop} />
        );
      }
      break;

    case "generating":
      key = `generating-${generation}`;
      content =
        report && theme ? (
          <Generating
            report={report}
            answers={answers}
            theme={theme}
            selectedFindingIds={selectedFindingIds}
            onComplete={complete}
          />
        ) : null;
      break;

    case "compare":
      content = report ? (
        <Compare
          report={report}
          html={html}
          newScore={newScore}
          onRegenerate={
            theme
              ? () => {
                  setGeneration((g) => g + 1);
                  setStage("generating");
                }
              : undefined
          }
          onEditFindings={() => setStage("findings")}
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
