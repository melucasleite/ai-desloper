"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "motion/react";
import type { Box } from "@/lib/types";

type Shot = { url: string; fullHeight: number; width: number };
type View = "desktop" | "mobile";

interface Props {
  screenshots: Partial<Record<View, Shot>>;
  /** Region currently being inspected, in CSS px of its viewport. */
  box?: Box | null;
  /** While true the preview drifts and the scan line runs. */
  active: boolean;
  className?: string;
}

/** Frame aspect (width / height) for each viewport. */
const ASPECT: Record<View, number> = { mobile: 390 / 800, desktop: 16 / 10 };
const DRIFT_PX_PER_SEC = 42;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export default function ScanPreview({
  screenshots,
  box,
  active,
  className,
}: Props) {
  const reduced = useReducedMotion();
  const view: View =
    box && screenshots[box.viewport]
      ? box.viewport
      : screenshots.mobile
        ? "mobile"
        : screenshots.desktop
          ? "desktop"
          : "mobile";
  const shot = screenshots[view];
  const focus = box && box.viewport === view ? box : null;

  const [frameRef, frameWidth] = useWidth<HTMLDivElement>();
  const scale = shot && frameWidth ? frameWidth / shot.width : 0;
  const frameHeight = frameWidth / ASPECT[view];
  const imageHeight = shot ? shot.fullHeight * scale : 0;
  const maxScroll = Math.max(0, imageHeight - frameHeight);

  const y = useMotionValue(0);
  const focusKey = focus
    ? `${focus.x},${focus.y},${focus.width},${focus.height}`
    : "";

  // Scroll to the inspected region, then resume a slow drift down the page.
  useEffect(() => {
    if (!shot || maxScroll <= 0) {
      y.set(0);
      return;
    }
    let controls: AnimationPlaybackControls | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const drift = () => {
      if (cancelled || !active || reduced) return;
      const remaining = maxScroll + y.get();
      if (remaining < 4) {
        timers.push(
          setTimeout(() => {
            controls = animate(y, 0, {
              type: "spring",
              stiffness: 30,
              damping: 16,
            });
            timers.push(setTimeout(drift, 2200));
          }, 1400),
        );
        return;
      }
      controls = animate(y, -maxScroll, {
        duration: remaining / DRIFT_PX_PER_SEC,
        ease: "linear",
        onComplete: drift,
      });
    };

    if (focus) {
      const target = Math.min(
        0,
        Math.max(-maxScroll, -(focus.y * scale - frameHeight * 0.3)),
      );
      if (reduced) y.set(target);
      else
        controls = animate(y, target, {
          type: "spring",
          stiffness: 70,
          damping: 20,
        });
      timers.push(setTimeout(drift, 1800));
    } else {
      drift();
    }

    return () => {
      cancelled = true;
      controls?.stop();
      timers.forEach(clearTimeout);
    };
    // focusKey stands in for the focus box identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, shot?.url, maxScroll, scale, frameHeight, active, reduced]);

  const isMobile = view === "mobile";

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 200, damping: 28 }}
      className={`relative ${
        isMobile ? "w-[min(17rem,100%)]" : "w-[min(34rem,100%)]"
      } ${className ?? ""}`}
    >
      <motion.div
        layout
        style={{ borderRadius: isMobile ? 34 : 14 }}
        className="relative border border-line bg-surface p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_60px_-28px_rgb(0_0_0/0.28)]"
      >
        <motion.div
          layout
          ref={frameRef}
          style={{
            borderRadius: isMobile ? 28 : 9,
            aspectRatio: ASPECT[view],
          }}
          className="relative overflow-hidden bg-bg"
        >
          {shot ? (
            <motion.div
              className="absolute inset-x-0 top-0"
              style={{ y, height: imageHeight || undefined }}
            >
              <motion.img
                key={shot.url}
                src={shot.url}
                alt="Screenshot of the page being analyzed"
                width={shot.width}
                height={shot.fullHeight}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="block h-auto w-full select-none"
                draggable={false}
              />
              {focus && scale ? (
                <motion.div
                  aria-hidden
                  initial={false}
                  animate={{
                    x: focus.x * scale - 3,
                    y: focus.y * scale - 3,
                    width: Math.max(12, focus.width * scale + 6),
                    height: Math.max(12, focus.height * scale + 6),
                    opacity: 1,
                  }}
                  transition={{ type: "spring", stiffness: 160, damping: 22 }}
                  className="absolute top-0 left-0 rounded-md border-2 border-accent bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_14%,transparent)]"
                />
              ) : null}
            </motion.div>
          ) : (
            <Skeleton />
          )}

          {active ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 animate-scan motion-reduce:hidden"
            >
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-[color-mix(in_oklab,var(--color-accent)_14%,transparent)]" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-accent opacity-70" />
            </div>
          ) : null}
        </motion.div>
      </motion.div>
      <p className="mt-3 text-center text-xs text-muted tabular-nums">
        {shot
          ? `${isMobile ? "Phone" : "Desktop"} · ${shot.width} × ${shot.fullHeight.toLocaleString("en-US")}px`
          : "Opening the page"}
      </p>
    </motion.div>
  );
}

function Skeleton() {
  return (
    <div className="absolute inset-0 flex animate-shimmer flex-col gap-3 p-5">
      <div className="h-3 w-1/3 rounded-full bg-line" />
      <div className="mt-6 h-6 w-4/5 rounded-md bg-line" />
      <div className="h-6 w-3/5 rounded-md bg-line" />
      <div className="mt-2 h-3 w-full rounded-full bg-line" />
      <div className="h-3 w-5/6 rounded-full bg-line" />
      <div className="mt-4 h-9 w-2/5 rounded-full bg-line" />
      <div className="mt-6 aspect-video w-full rounded-lg bg-line" />
    </div>
  );
}
