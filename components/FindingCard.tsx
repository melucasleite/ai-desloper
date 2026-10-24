"use client";

import { motion, useReducedMotion } from "motion/react";

import type { Box, Finding, Severity } from "@/lib/types";

/** CSS widths the capture renders each viewport at. */
const CAPTURE_WIDTH = { desktop: 1440, mobile: 390 } as const;
const THUMB_W = 280;
const THUMB_H = 160;

const SEVERITY_LABEL: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEVERITY_DOTS: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

interface FindingCardProps {
  finding: Finding;
  selected: boolean;
  onToggle(): void;
  /** Full-page screenshot URLs from the report. */
  screenshots?: { desktop: string; mobile: string };
}

/** Background-position crop of `box` from a full-page screenshot. */
function cropStyle(box: Box, url: string): React.CSSProperties {
  const pageWidth = CAPTURE_WIDTH[box.viewport];
  const pad = 24;
  const w = Math.max(1, box.width + pad * 2);
  const h = Math.max(1, box.height + pad * 2);
  const scale = Math.min(
    THUMB_W / w,
    THUMB_H / h,
    box.viewport === "mobile" ? 1.2 : 0.9,
  );
  const cx = (box.x + box.width / 2) * scale;
  const cy = (box.y + box.height / 2) * scale;
  const x = Math.min(
    0,
    Math.max(THUMB_W - pageWidth * scale, THUMB_W / 2 - cx),
  );
  const y = Math.min(0, THUMB_H / 2 - cy);
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${pageWidth * scale}px auto`,
    backgroundPosition: `${x}px ${y}px`,
    backgroundRepeat: "no-repeat",
  };
}

export default function FindingCard({
  finding,
  selected,
  onToggle,
  screenshots,
}: FindingCardProps) {
  const reduce = useReducedMotion();
  const box = finding.boxes[0];
  const shot = box && screenshots?.[box.viewport];

  return (
    <motion.div
      layout={!reduce}
      role="switch"
      tabIndex={0}
      aria-checked={selected}
      aria-label={finding.title}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={`group flex w-full cursor-pointer flex-col gap-5 rounded-2xl border p-5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent sm:flex-row sm:p-6 ${
        selected
          ? "border-ink/25 bg-surface"
          : "border-line bg-transparent opacity-60 hover:opacity-90"
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <SeverityTag severity={finding.severity} />
          <Toggle on={selected} />
        </div>
        <h4
          className={`text-lg font-semibold leading-snug tracking-tight text-ink ${selected ? "" : "line-through decoration-muted/60"}`}
        >
          {finding.title}
        </h4>
        <p className="text-[15px] leading-relaxed text-muted">
          {finding.detail}
        </p>
        {finding.evidence.length > 0 && (
          <ul className="mt-1 flex flex-col gap-2">
            {finding.evidence.slice(0, 3).map((quote, i) => (
              <li key={i}>
                <blockquote className="border-l-2 border-line pl-3 text-sm italic leading-relaxed text-ink/80">
                  “{quote.length > 180 ? `${quote.slice(0, 177)}…` : quote}”
                </blockquote>
              </li>
            ))}
          </ul>
        )}
      </div>
      {box && shot && (
        <div
          role="img"
          aria-label={`Where this appears on the ${box.viewport} page`}
          className="relative shrink-0 overflow-hidden rounded-xl border border-line bg-bg"
          style={{
            width: THUMB_W,
            height: THUMB_H,
            maxWidth: "100%",
            ...cropStyle(box, shot),
          }}
        >
          <span className="absolute bottom-2 right-2 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-medium text-bg">
            {box.viewport === "mobile" ? "390px" : "1440px"}
          </span>
        </div>
      )}
    </motion.div>
  );
}

function SeverityTag({ severity }: { severity: Severity }) {
  const tone =
    severity === "high"
      ? "text-bad"
      : severity === "medium"
        ? "text-accent"
        : "text-muted";
  return (
    <span
      className={`flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] ${tone}`}
    >
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i < SEVERITY_DOTS[severity] ? "bg-current" : "bg-line"}`}
          />
        ))}
      </span>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-ink" : "bg-line"
      }`}
    >
      <motion.span
        className="absolute h-5 w-5 rounded-full bg-bg shadow-sm"
        animate={{ x: on ? 18 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
    </span>
  );
}
