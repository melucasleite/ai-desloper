"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import FlipFab, { FlipCard, type FlipSide } from "@/components/FlipFab";
import HtmlFrame, {
  type FrameViewport,
  type HtmlFrameHandle,
} from "@/components/HtmlFrame";

interface SplitViewProps {
  /** Same-origin URL of the frozen original (e.g. /api/snapshot/<id>). */
  originalSrc: string;
  newHtml: string;
  streaming?: boolean;
  originalScore?: number;
  newScore?: number | null;
  /** Full-page screenshots, offered as a fallback when the snapshot renders badly. */
  originalScreenshots?: Partial<Record<FrameViewport, string>>;
  /** Mobile only: content pinned over the top of the full-screen page. */
  mobileOverlay?: ReactNode;
  className?: string;
}

const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

export function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return mobile;
}

export default function SplitView({
  originalSrc,
  newHtml,
  streaming = false,
  originalScore,
  newScore,
  originalScreenshots,
  mobileOverlay,
  className = "",
}: SplitViewProps) {
  const isMobile = useIsMobile();
  const [viewport, setViewport] = useState<FrameViewport>("desktop");
  const [locked, setLocked] = useState(true);
  const [originalMode, setOriginalMode] = useState<"snapshot" | "screenshot">(
    "snapshot",
  );
  const beforeRef = useRef<HtmlFrameHandle>(null);
  const afterRef = useRef<HtmlFrameHandle>(null);
  const syncing = locked && !streaming;

  const screenshot = originalScreenshots?.[viewport];
  const showScreenshot = originalMode === "screenshot" && !!screenshot;

  const onBeforeScroll = useCallback(
    (r: number) => syncing && afterRef.current?.setScrollRatio(r),
    [syncing],
  );
  const onAfterScroll = useCallback(
    (r: number) => syncing && beforeRef.current?.setScrollRatio(r),
    [syncing],
  );

  if (isMobile) {
    return (
      <MobileFlip
        originalSrc={originalSrc}
        newHtml={newHtml}
        streaming={streaming}
        originalScore={originalScore}
        newScore={newScore}
        overlay={mobileOverlay}
      />
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<FrameViewport>
          label="Viewport"
          value={viewport}
          onChange={setViewport}
          options={[
            { value: "desktop", label: "Desktop" },
            { value: "mobile", label: "Mobile" },
          ]}
        />
        <ScoreDelta from={originalScore} to={newScore} pending={streaming} />
        <div className="flex items-center gap-2">
          {originalScreenshots && (
            <Segmented<"snapshot" | "screenshot">
              label="Original as"
              value={originalMode}
              onChange={setOriginalMode}
              options={[
                { value: "snapshot", label: "Page" },
                { value: "screenshot", label: "Image" },
              ]}
            />
          )}
          <button
            type="button"
            onClick={() => setLocked((l) => !l)}
            aria-pressed={locked}
            disabled={streaming}
            className="flex h-9 items-center gap-2 rounded-full border border-line px-3.5 text-sm text-muted transition-colors hover:text-ink disabled:opacity-40 aria-pressed:text-ink"
          >
            <LockGlyph locked={locked} />
            {locked ? "Scroll synced" : "Scroll free"}
          </button>
        </div>
      </div>

      <div className="grid min-h-[60vh] flex-1 grid-cols-2 gap-4">
        <Pane label="Before" score={originalScore} tone="bad">
          {showScreenshot ? (
            <ScreenshotScroller src={screenshot} viewport={viewport} />
          ) : (
            <HtmlFrame
              ref={beforeRef}
              src={originalSrc}
              title="Original page"
              viewport={viewport}
              onScrollRatio={onBeforeScroll}
            />
          )}
        </Pane>
        <Pane
          label="After"
          score={newScore ?? undefined}
          tone="good"
          live={streaming}
        >
          <HtmlFrame
            ref={afterRef}
            html={newHtml}
            title="New page"
            viewport={viewport}
            streaming={streaming}
            follow={streaming}
            onScrollRatio={onAfterScroll}
          />
        </Pane>
      </div>
    </div>
  );
}

function Pane({
  label,
  score,
  tone,
  live,
  children,
}: {
  label: string;
  score?: number;
  tone: "good" | "bad";
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          {label}
          {live && (
            <span className="relative flex h-2 w-2" aria-label="Writing">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
          )}
        </span>
        {score !== undefined && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
              tone === "good" ? "bg-good/12 text-good" : "bg-bad/12 text-bad"
            }`}
          >
            Slop {Math.round(score)}
          </span>
        )}
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
    </section>
  );
}

function ScoreDelta({
  from,
  to,
  pending,
}: {
  from?: number;
  to?: number | null;
  pending: boolean;
}) {
  if (from === undefined) return null;
  return (
    <div
      className="flex items-center gap-2 text-sm tabular-nums"
      aria-live="polite"
    >
      <span className="text-bad">{Math.round(from)}</span>
      <span className="text-muted" aria-hidden>
        →
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={to ?? "pending"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={spring}
          className={to != null ? "font-semibold text-good" : "text-muted"}
        >
          {to != null ? Math.round(to) : pending ? "writing" : "scoring"}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">
        {to != null
          ? `Slop score went from ${from} to ${to}`
          : "New score pending"}
      </span>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange(v: T): void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex h-9 rounded-full border border-line p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`relative rounded-full px-3.5 text-sm transition-colors ${
              active ? "text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${label}`}
                className="absolute inset-0 rounded-full bg-ink"
                transition={spring}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ScreenshotScroller({
  src,
  viewport,
}: {
  src: string;
  viewport: FrameViewport;
}) {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Full-page screenshot of the original"
        className="mx-auto block h-auto w-full"
        style={{ maxWidth: viewport === "mobile" ? 390 : undefined }}
      />
    </div>
  );
}

function LockGlyph({ locked }: { locked: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path
        d={locked ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V7a4 4 0 0 1 7.5-2"}
        strokeLinecap="round"
      />
    </svg>
  );
}

function MobileFlip({
  originalSrc,
  newHtml,
  streaming,
  originalScore,
  newScore,
  overlay,
}: {
  originalSrc: string;
  newHtml: string;
  streaming: boolean;
  originalScore?: number;
  newScore?: number | null;
  overlay?: ReactNode;
}) {
  const [side, setSide] = useState<FlipSide>("after");
  const [peeking, setPeeking] = useState(false);
  const reduce = useReducedMotion();
  const shown: FlipSide = peeking ? "before" : side;

  const badge = (
    label: string,
    score: number | null | undefined,
    tone: "good" | "bad",
  ) => (
    <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-bg">
      {label}
      {score != null && (
        <span
          className={`tabular-nums ${tone === "good" ? "text-good" : "text-bad"}`}
        >
          {Math.round(score)}
        </span>
      )}
    </div>
  );

  return (
    // Fixed and full-screen on phones: the page is the whole canvas, the
    // overlay pill carries status/actions and the FAB flips sides.
    <div className="fixed inset-0 z-40 h-[100dvh] w-full overflow-hidden bg-bg">
      <FlipCard
        side={shown}
        className="h-full w-full"
        front={
          <div className="relative h-full w-full bg-white">
            <HtmlFrame
              html={newHtml}
              title="New page"
              viewport="mobile"
              streaming={streaming}
              follow={streaming}
            />
            {badge("After", newScore, "good")}
          </div>
        }
        back={
          <div className="relative h-full w-full bg-white">
            <HtmlFrame
              src={originalSrc}
              title="Original page"
              viewport="mobile"
            />
            {badge("Before", originalScore, "bad")}
          </div>
        }
      />
      {overlay && (
        <div className="absolute inset-x-0 top-0 z-20">{overlay}</div>
      )}
      <AnimatePresence>
        {peeking && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-0 top-16 z-30 mx-auto w-max rounded-full bg-ink px-3 py-1 text-xs text-bg"
          >
            Peeking at the original
          </motion.div>
        )}
      </AnimatePresence>
      <FlipFab
        side={shown}
        onFlip={() => setSide((s) => (s === "after" ? "before" : "after"))}
        onPeek={setPeeking}
      />
    </div>
  );
}
