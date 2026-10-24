"use client";

import { AnimatePresence, motion } from "motion/react";

export type PillTone = "working" | "done" | "error";

interface Props {
  url: string;
  message: string;
  tone?: PillTone;
  /** Shared with the Idle input so the field morphs into the pill. */
  layoutId?: string;
}

export function displayHost(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const DOT: Record<PillTone, string> = {
  working: "bg-accent",
  done: "bg-good",
  error: "bg-bad",
};

export default function StatusPill({
  url,
  message,
  tone = "working",
  layoutId,
}: Props) {
  return (
    <motion.div
      layoutId={layoutId}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      style={{ borderRadius: 999 }}
      className="inline-flex max-w-full min-w-0 items-center gap-3 border border-line bg-surface py-2 pr-4 pl-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex size-2 shrink-0" aria-hidden>
        {tone === "working" ? (
          <span className="absolute inset-0 animate-ping-soft rounded-full bg-accent" />
        ) : null}
        <span
          className={`relative size-2 rounded-full transition-colors duration-500 ${DOT[tone]}`}
        />
      </span>
      <motion.span
        layout="position"
        className="shrink-0 text-sm font-medium text-ink"
      >
        {displayHost(url)}
      </motion.span>
      <span className="h-3.5 w-px shrink-0 bg-line" aria-hidden />
      <span className="relative min-w-0 overflow-hidden text-sm text-muted">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={message}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="block truncate"
          >
            {message}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.div>
  );
}
