"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef, type ReactNode } from "react";

export type FlipSide = "after" | "before";

const LONG_PRESS_MS = 320;

interface FlipFabProps {
  side: FlipSide;
  onFlip(): void;
  /** Called with true while a long-press peeks the original, false on release. */
  onPeek(peeking: boolean): void;
  className?: string;
}

/** Floating button: tap flips After/Before, press and hold peeks the original. */
export default function FlipFab({
  side,
  onFlip,
  onPeek,
  className = "",
}: FlipFabProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peeking = useRef(false);
  const reduce = useReducedMotion();

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const end = (commit: boolean) => {
    clear();
    if (peeking.current) {
      peeking.current = false;
      onPeek(false);
    } else if (commit) {
      onFlip();
    }
  };

  const label = side === "after" ? "After" : "Before";
  const next = side === "after" ? "original" : "new page";

  return (
    <motion.button
      type="button"
      aria-label={`Showing ${label.toLowerCase()}. Tap to see the ${next}, hold to peek at the original.`}
      initial={reduce ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={reduce ? undefined : { scale: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        clear();
        timer.current = setTimeout(() => {
          peeking.current = true;
          onPeek(true);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFlip();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`fixed bottom-5 right-5 z-50 flex h-14 select-none items-center gap-3 rounded-full bg-ink pl-4 pr-5 text-bg shadow-[0_12px_32px_-8px_rgb(0_0_0/0.45)] [-webkit-touch-callout:none] [touch-action:none] ${className}`}
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <FlipGlyph flipped={side === "before"} />
      <span className="text-[15px] font-semibold tracking-tight">{label}</span>
    </motion.button>
  );
}

function FlipGlyph({ flipped }: { flipped: boolean }) {
  return (
    <motion.svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      animate={{ rotateY: flipped ? 180 : 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      aria-hidden
    >
      <rect x="3" y="5" width="8" height="14" rx="2" />
      <path
        d="M15 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"
        strokeDasharray="2 2.5"
      />
      <path d="M13 9l2-2-2-2" />
    </motion.svg>
  );
}

interface FlipCardProps {
  /** Which face is showing. */
  side: FlipSide;
  front: ReactNode;
  back: ReactNode;
  className?: string;
}

/** A 3D card with the new page on the front and the original on the back. */
export function FlipCard({ side, front, back, className = "" }: FlipCardProps) {
  const reduce = useReducedMotion();
  const flipped = side === "before";

  if (reduce) {
    return (
      <div className={`relative ${className}`}>
        <div className={flipped ? "hidden" : "absolute inset-0"}>{front}</div>
        <div className={flipped ? "absolute inset-0" : "hidden"}>{back}</div>
      </div>
    );
  }

  return (
    <div className={`relative [perspective:1800px] ${className}`}>
      <motion.div
        className="absolute inset-0 [transform-style:preserve-3d]"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 20, mass: 0.9 }}
      >
        <div
          className="absolute inset-0 [backface-visibility:hidden]"
          aria-hidden={flipped}
          style={{ pointerEvents: flipped ? "none" : "auto" }}
        >
          {front}
        </div>
        <div
          className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          aria-hidden={!flipped}
          style={{ pointerEvents: flipped ? "auto" : "none" }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}
