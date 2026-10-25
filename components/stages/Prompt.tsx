"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildFixPrompt, fixPromptFilename } from "@/lib/fix-prompt";
import { QUESTIONS } from "@/lib/generate/questions";
import type {
  InterviewAnswers,
  InterviewSaveRequest,
  Report,
} from "@/lib/types";

interface PromptProps {
  report: Report;
  selected: ReadonlySet<string>;
  answers: InterviewAnswers;
  onAnswersChange(next: InterviewAnswers): void;
  /** Author of the report (claim token or owner session): answers are saved. */
  canPersist: boolean;
  onBack(): void;
  onRestart(): void;
}

const spring = { type: "spring", stiffness: 300, damping: 30 } as const;

/** Shown up front; the rest sit behind "More questions". */
const PRIMARY_KEYS = new Set(["story", "pain", "customer", "action"]);

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and some embedded views: fall back to a hidden field.
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    field.remove();
    return ok;
  }
}

export default function Prompt({
  report,
  selected,
  answers,
  onAnswersChange,
  canPersist,
  onBack,
  onRestart,
}: PromptProps) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [moreOpen, setMoreOpen] = useState(() =>
    QUESTIONS.some(
      (q) => !PRIMARY_KEYS.has(q.key) && (answers[q.key] ?? "").trim(),
    ),
  );
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedAnswers = useRef(JSON.stringify(answers));

  const prompt = useMemo(
    () =>
      buildFixPrompt({
        report,
        selectedFindingIds: selected,
        answers,
      }),
    [report, selected, answers],
  );

  const fixCount = report.findings.filter((f) => selected.has(f.id)).length;
  const answered = QUESTIONS.filter((q) =>
    (answers[q.key] ?? "").trim(),
  ).length;

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  // Saves only when something changed since the last save; failures are quiet
  // because the prompt itself never depends on the save.
  const persist = useCallback(
    (next: InterviewAnswers = answers) => {
      if (!canPersist) return;
      const snapshot = JSON.stringify(next);
      if (snapshot === savedAnswers.current) return;
      savedAnswers.current = snapshot;
      const body: InterviewSaveRequest = {
        reportId: report.id,
        claimToken: report.claimToken,
        answers: next,
      };
      void fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {
        savedAnswers.current = "";
      });
    },
    [answers, canPersist, report.id, report.claimToken],
  );

  const copy = async () => {
    persist();
    const ok = await copyText(prompt);
    setCopyFailed(!ok);
    if (!ok) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2200);
  };

  const download = () => {
    persist();
    const blob = new Blob([prompt], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = fixPromptFilename(report.url);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  // One click: drop every answer and fold the panel away. Reopening starts blank.
  const skip = () => {
    setSkipped(true);
    setMoreOpen(false);
    onAnswersChange({});
    persist({});
  };

  const setAnswer = (key: keyof InterviewAnswers, value: string) =>
    onAnswersChange({ ...answers, [key]: value });

  const primary = QUESTIONS.filter((q) => PRIMARY_KEYS.has(q.key));
  const more = QUESTIONS.filter((q) => !PRIMARY_KEYS.has(q.key));
  const lines = prompt.split("\n").length;

  const field = (q: (typeof QUESTIONS)[number]) => (
    <div key={q.key} className="flex flex-col gap-1.5">
      <label
        htmlFor={`answer-${q.key}`}
        className="text-sm font-medium leading-snug text-ink"
      >
        {q.question}
      </label>
      <textarea
        id={`answer-${q.key}`}
        rows={2}
        value={answers[q.key] ?? ""}
        placeholder={q.placeholder}
        onChange={(e) => setAnswer(q.key, e.target.value)}
        onBlur={() => persist()}
        className="field-sizing-content max-h-48 min-h-[4.5rem] w-full resize-none rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-ink/40 focus-visible:outline-none"
      />
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 flex h-9 items-center gap-1.5 rounded-full px-2 text-sm text-muted transition-colors hover:text-ink"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Back to results
      </button>

      <motion.header
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="mt-6 flex max-w-3xl flex-col gap-4"
      >
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-muted">
          {fixCount} {fixCount === 1 ? "fix" : "fixes"} · slop score{" "}
          {Math.round(report.score.total)}
        </p>
        <h1 className="text-4xl font-semibold text-ink sm:text-[56px]">
          Hand this to your AI.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted">
          Paste it into the AI coding tool you already use, opened on the
          project that builds this page. It says what to fix, what to keep and
          the rules the new version has to meet.
        </p>
      </motion.header>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-12">
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.06 }}
          aria-labelledby="prompt-heading"
          className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_60px_-32px_rgb(0_0_0/0.25)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <h2
                id="prompt-heading"
                className="truncate text-sm font-semibold text-ink"
              >
                The fix prompt
              </h2>
              <p className="text-xs tabular-nums text-muted">
                {lines} lines · {prompt.length.toLocaleString("en-US")}{" "}
                characters
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={download}
                className="h-10 rounded-full border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-ink/40"
              >
                Download .md
              </button>
              <CopyButton copied={copied} onCopy={copy} />
            </div>
          </div>
          <pre
            tabIndex={0}
            aria-label="Fix prompt"
            className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words px-4 py-5 font-mono text-[13px] leading-[1.75] text-ink/90 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-8 sm:py-7 sm:text-[13.5px]"
          >
            {prompt}
          </pre>
          <p className="sr-only" role="status" aria-live="polite">
            {copied
              ? "Prompt copied to the clipboard."
              : copyFailed
                ? "Could not copy. Select the text and copy it by hand."
                : ""}
          </p>
          {copyFailed && (
            <p className="border-t border-line px-4 py-3 text-sm text-bad sm:px-6">
              The clipboard is blocked here. Select the text and copy it by
              hand, or download the file.
            </p>
          )}
        </motion.section>

        <motion.aside
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.12 }}
          aria-labelledby="make-yours-heading"
          className="flex flex-col gap-5 lg:sticky lg:top-6"
        >
          <AnimatePresence mode="wait" initial={false}>
            {skipped ? (
              <motion.div
                key="skipped"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring}
                className="flex flex-col items-start gap-3 rounded-card border border-line p-5"
              >
                <h2
                  id="make-yours-heading"
                  className="text-base font-semibold text-ink"
                >
                  Built from the findings only
                </h2>
                <p className="text-[15px] leading-relaxed text-muted">
                  No story or voice notes in the prompt. Your AI works from what
                  the page already says.
                </p>
                <button
                  type="button"
                  onClick={() => setSkipped(false)}
                  className="h-10 rounded-full border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-ink/40"
                >
                  Add your story after all
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="panel"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring}
                className="flex flex-col gap-5"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2
                      id="make-yours-heading"
                      className="text-xl font-semibold text-ink"
                    >
                      Make it yours
                    </h2>
                    <span className="text-sm tabular-nums text-muted">
                      {answered} of {QUESTIONS.length}
                    </span>
                  </div>
                  <p className="text-[15px] leading-relaxed text-muted">
                    Optional. Each answer goes into the prompt as you type, as
                    the source for the story and the voice.
                  </p>
                </div>

                <div className="flex flex-col gap-4">{primary.map(field)}</div>

                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  aria-expanded={moreOpen}
                  aria-controls="more-questions"
                  className="flex h-9 items-center gap-2 self-start text-sm font-medium text-muted transition-colors hover:text-ink"
                >
                  <motion.svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    animate={{ rotate: moreOpen ? 90 : 0 }}
                    transition={spring}
                    aria-hidden
                  >
                    <path d="M9 6l6 6-6 6" />
                  </motion.svg>
                  {moreOpen
                    ? "Fewer questions"
                    : `${more.length} more questions`}
                </button>

                <AnimatePresence initial={false}>
                  {moreOpen && (
                    <motion.div
                      id="more-questions"
                      key="more"
                      initial={
                        reduce ? { opacity: 0 } : { height: 0, opacity: 0 }
                      }
                      animate={
                        reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }
                      }
                      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={spring}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-4 pb-1">
                        {more.map(field)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="button"
                  onClick={skip}
                  className="h-11 self-start rounded-full border border-line px-5 text-sm font-medium text-ink transition-colors hover:border-ink/40"
                >
                  Skip, just give me the prompt
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      </div>

      <div className="mt-16 flex flex-wrap items-center gap-3 border-t border-line pt-8">
        <button
          type="button"
          onClick={onBack}
          className="h-11 rounded-full border border-line px-5 text-sm font-medium text-ink transition-colors hover:border-ink/40"
        >
          Back to results
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="h-11 rounded-full px-5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          Analyze another page
        </button>
      </div>
    </div>
  );
}

function CopyButton({ copied, onCopy }: { copied: boolean; onCopy(): void }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onCopy}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={spring}
      className="relative h-10 min-w-[7.5rem] overflow-hidden rounded-full bg-ink px-5 text-sm font-semibold text-bg"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={copied ? "copied" : "copy"}
          initial={reduce ? { opacity: 0 } : { y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: -14, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
          className="flex items-center justify-center gap-1.5"
        >
          {copied ? (
            <>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              Copied
            </>
          ) : (
            "Copy prompt"
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
