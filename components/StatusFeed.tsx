"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AnalyzeEvent, Finding, Severity } from "@/lib/types";
import { tenetTitle } from "@/lib/tenets";

interface Props {
  events: AnalyzeEvent[];
  /** Cap on rendered lines; older ones scroll away. */
  limit?: number;
  className?: string;
}

type Line =
  | { kind: "text"; key: string; text: string }
  | { kind: "finding"; key: string; finding: Finding };

const NUMBER = /(\d[\d,]*(?:\.\d+)?(?:%|px|s|ms|x)?)/g;

/** Wraps real numbers in tabular, emphasized spans. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(NUMBER);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-medium text-ink tabular-nums">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const SEVERITY_DOT: Record<Severity, string> = {
  low: "bg-muted",
  medium: "bg-[color-mix(in_oklab,var(--color-bad)_60%,var(--color-muted))]",
  high: "bg-bad",
};

function FindingChip({ finding }: { finding: Finding }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-2 text-[13px] leading-5">
      <span
        className={`size-1.5 shrink-0 rounded-full ${SEVERITY_DOT[finding.severity]}`}
        aria-hidden
      />
      <span className="shrink-0 text-muted">{tenetTitle(finding.tenet)}</span>
      <span className="truncate text-ink">{finding.title}</span>
    </span>
  );
}

function toLines(events: AnalyzeEvent[]): Line[] {
  const lines: Line[] = [];
  events.forEach((ev, i) => {
    if (ev.type === "status") {
      lines.push({ kind: "text", key: `s${i}`, text: ev.message });
    } else if (ev.type === "metric") {
      lines.push({ kind: "text", key: `m${i}`, text: ev.label });
    } else if (ev.type === "finding") {
      lines.push({ kind: "finding", key: `f${i}`, finding: ev.finding });
    }
  });
  return lines;
}

export default function StatusFeed({ events, limit = 60, className }: Props) {
  const lines = useMemo(() => toLines(events).slice(-limit), [events, limit]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  const lastText = lines.findLastIndex((l) => l.kind === "text");

  return (
    <div
      ref={scroller}
      className={`overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_3rem)] [scrollbar-width:none] ${className ?? ""}`}
    >
      <ol
        className="flex flex-col gap-2.5 pt-12 pb-1"
        aria-label="Analysis log"
      >
        <AnimatePresence initial={false}>
          {lines.map((line, i) => {
            const newest = i === lastText;
            return (
              <motion.li
                key={line.key}
                layout="position"
                initial={{ opacity: 0, y: 10, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
                className="min-w-0"
              >
                {line.kind === "finding" ? (
                  <FindingChip finding={line.finding} />
                ) : (
                  <p
                    className={`transition-colors duration-700 ${
                      newest
                        ? "text-[17px] leading-snug text-ink"
                        : "text-[15px] leading-snug text-muted"
                    }`}
                  >
                    <Highlighted text={line.text} />
                  </p>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}
