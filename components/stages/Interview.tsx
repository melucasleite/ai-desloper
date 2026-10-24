"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { QUESTIONS } from "@/lib/generate/questions";
import type {
  InterviewAckRequest,
  InterviewAnswers,
  InterviewKey,
  Report,
} from "@/lib/types";

interface InterviewProps {
  /** May still be null while the analysis finishes. */
  report: Report | null;
  answers: InterviewAnswers;
  onChange(a: InterviewAnswers): void;
  onDone(): void;
}

const ENCOURAGED = new Set<InterviewKey>(
  QUESTIONS.filter((q, i) => q.required || i < 3).map((q) => q.key),
);

const NUDGES: Partial<Record<InterviewKey, string>> = {
  story: "This one carries the most weight. Even a sentence helps.",
  pain: "A rough paraphrase is fine. It becomes your headline.",
  customer: "Narrow beats broad. One job title is plenty.",
};

const spring = { type: "spring", stiffness: 300, damping: 30 } as const;

interface Ack {
  /** Index of the question the reply belongs to. */
  index: number;
  text: string | null; // null while pending
}

export default function Interview({
  report,
  answers,
  onChange,
  onDone,
}: InterviewProps) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [nudged, setNudged] = useState<InterviewKey | null>(null);
  const [ack, setAck] = useState<Ack | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ackAbort = useRef<AbortController | null>(null);
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const total = QUESTIONS.length;
  const finished = index >= total;
  const question = QUESTIONS[Math.min(index, total - 1)];
  const value = answers[question.key] ?? "";

  // Autosize the textarea to its content.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.45)}px`;
  }, [value, index]);

  useEffect(() => {
    if (!finished) textareaRef.current?.focus({ preventScroll: true });
  }, [index, finished]);

  useEffect(() => () => ackAbort.current?.abort(), []);

  const requestAck = useCallback(
    async (i: number, answer: string) => {
      ackAbort.current?.abort();
      const controller = new AbortController();
      ackAbort.current = controller;
      setAck({ index: i, text: null });
      const q = QUESTIONS[i];
      const body: InterviewAckRequest = {
        reportId: report?.id ?? "",
        key: q.key,
        question: q.question,
        answer,
        answers: { ...answersRef.current, [q.key]: answer },
        productFacts: report?.productFacts ?? [],
      };
      try {
        const res = await fetch("/api/interview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { reply?: string };
        if (!controller.signal.aborted) {
          setAck(data.reply ? { index: i, text: data.reply } : null);
        }
      } catch {
        if (!controller.signal.aborted) setAck(null);
      }
    },
    [report],
  );

  const go = useCallback(
    (next: number) => {
      setDirection(next > index ? 1 : -1);
      setNudged(null);
      setIndex(Math.max(0, Math.min(total, next)));
    },
    [index, total],
  );

  const advance = useCallback(
    (skip = false) => {
      const answer = (answers[question.key] ?? "").trim();
      if (
        !skip &&
        !answer &&
        ENCOURAGED.has(question.key) &&
        nudged !== question.key
      ) {
        setNudged(question.key);
        return;
      }
      if (answer && !skip) void requestAck(index, answer);
      else setAck(null);
      go(index + 1);
    },
    [answers, question.key, nudged, requestAck, index, go],
  );

  const setValue = (text: string) => {
    if (nudged) setNudged(null);
    onChange({ ...answers, [question.key]: text });
  };

  const variants = {
    enter: (d: number) => ({
      opacity: 0,
      y: reduce ? 0 : d * 40,
      filter: reduce ? "none" : "blur(6px)",
    }),
    center: { opacity: 1, y: 0, filter: "blur(0px)" },
    exit: (d: number) => ({
      opacity: 0,
      y: reduce ? 0 : d * -40,
      filter: reduce ? "none" : "blur(6px)",
    }),
  };

  const visibleAck = ack && ack.index === index - 1 ? ack : null;
  const answeredCount = QUESTIONS.filter((q) =>
    (answers[q.key] ?? "").trim(),
  ).length;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col px-5 pb-10 pt-24 sm:px-8 sm:pt-28">
      <div className="mb-10 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="flex h-9 items-center gap-1.5 rounded-full px-2 text-sm text-muted transition-colors hover:text-ink disabled:invisible"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path
              d="M15 6l-6 6 6 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <ProgressDots
          index={index}
          total={total}
          answers={answers}
          onJump={go}
        />
        <span className="w-16 text-right text-sm tabular-nums text-muted">
          {finished ? "Done" : `${index + 1} / ${total}`}
        </span>
      </div>

      <div className="relative flex flex-1 flex-col">
        <div className="min-h-14">
          <AnimatePresence mode="wait">
            {visibleAck && (
              <motion.p
                key={`ack-${visibleAck.index}-${visibleAck.text === null}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring}
                className="max-w-xl text-lg leading-relaxed text-muted"
                aria-live="polite"
              >
                {visibleAck.text === null ? (
                  <ThinkingDots />
                ) : (
                  <TypeIn key={visibleAck.text} text={visibleAck.text} />
                )}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait" custom={direction} initial={false}>
          {finished ? (
            <motion.div
              key="done"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring}
              className="flex flex-col items-start gap-8 pt-6"
            >
              <h2 className="text-4xl font-semibold text-ink sm:text-6xl">
                {answeredCount >= 5
                  ? "That is plenty to work with."
                  : "Good enough to start."}
              </h2>
              <p className="max-w-xl text-lg leading-relaxed text-muted">
                {answeredCount > 0
                  ? `${answeredCount} of ${total} answered. Next, every problem we found on your page, and three directions for the new one.`
                  : "We will lean on what the page already says. You can always come back and add your story."}
              </p>
              <motion.button
                type="button"
                onClick={onDone}
                disabled={!report}
                whileHover={reduce || !report ? undefined : { scale: 1.02 }}
                whileTap={reduce || !report ? undefined : { scale: 0.98 }}
                transition={spring}
                className="flex h-16 items-center gap-3 rounded-full bg-ink px-8 text-lg font-semibold text-bg disabled:opacity-50"
              >
                {report ? "Show me what you found" : "Finishing the read"}
                {report ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <ThinkingDots />
                )}
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key={question.key}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring}
              className="flex flex-col gap-6 pt-6"
            >
              <label htmlFor={`q-${question.key}`} className="block">
                <span className="block text-4xl font-semibold leading-[1.08] text-ink [text-wrap:balance] sm:text-[56px]">
                  {question.question}
                </span>
                <span className="mt-4 block max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                  {question.hint}
                </span>
              </label>

              <textarea
                id={`q-${question.key}`}
                ref={textareaRef}
                rows={1}
                value={value}
                placeholder={question.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    advance();
                  }
                }}
                className="mt-4 w-full resize-none border-0 border-b-2 border-line bg-transparent pb-4 text-2xl leading-snug text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-ink focus-visible:outline-none sm:text-3xl"
              />

              <div className="min-h-6">
                <AnimatePresence>
                  {nudged === question.key && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[15px] text-accent"
                      role="status"
                    >
                      {NUDGES[question.key] ?? "Worth a sentence, if you can."}{" "}
                      Press Enter again to skip.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <motion.button
                  type="button"
                  onClick={() => advance()}
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                  className="flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-base font-semibold text-bg"
                >
                  {index === total - 1 ? "Finish" : "Next"}
                  <kbd className="hidden rounded border border-bg/30 px-1.5 text-xs font-normal opacity-70 sm:inline">
                    Enter
                  </kbd>
                </motion.button>
                <button
                  type="button"
                  onClick={() => advance(true)}
                  className="text-base text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
                >
                  Skip
                </button>
                <span className="hidden text-sm text-muted sm:inline">
                  Shift + Enter for a new line
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!report && !finished && (
        <p className="mt-10 flex items-center gap-2 text-sm text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-accent" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          Still reading your page in the background.
        </p>
      )}
    </div>
  );
}

function ProgressDots({
  index,
  total,
  answers,
  onJump,
}: {
  index: number;
  total: number;
  answers: InterviewAnswers;
  onJump(i: number): void;
}) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {QUESTIONS.map((q, i) => {
        const current = i === index;
        const answered = !!(answers[q.key] ?? "").trim();
        return (
          <li key={q.key}>
            <button
              type="button"
              onClick={() => onJump(i)}
              aria-label={`Question ${i + 1}${answered ? ", answered" : ""}`}
              aria-current={current ? "step" : undefined}
              className="flex h-6 items-center px-0.5"
            >
              <motion.span
                className={`block h-1.5 rounded-full ${current ? "bg-ink" : answered ? "bg-ink/50" : "bg-line"}`}
                animate={{ width: current ? 22 : 6 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            </button>
          </li>
        );
      })}
      <li className="sr-only">
        {index >= total
          ? "All questions done"
          : `Question ${index + 1} of ${total}`}
      </li>
    </ol>
  );
}

/** Reveals text character by character; instant with reduced motion. */
function TypeIn({ text }: { text: string }) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(0);
  const shown = reduce ? text.length : count;
  useEffect(() => {
    if (reduce) return;
    const step = Math.max(1, Math.round(text.length / 60));
    const id = setInterval(() => {
      setCount((c) => {
        if (c + step >= text.length) clearInterval(id);
        return Math.min(text.length, c + step);
      });
    }, 18);
    return () => clearInterval(id);
  }, [text, reduce]);
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{text.slice(0, shown)}</span>
    </>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
