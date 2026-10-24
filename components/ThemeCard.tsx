"use client";

import { motion, useReducedMotion } from "motion/react";

import type { Theme } from "@/lib/types";

interface ThemeCardProps {
  theme: Theme;
  selected: boolean;
  onSelect(): void;
  index: number;
}

/** First family from a CSS font stack, unquoted. */
export function primaryFamily(stack: string): string {
  return stack
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
}

/** Google Fonts css2 URL for the theme's pairing. */
export function themeFontsHref(theme: Theme): string {
  const families = [
    ...new Set([
      primaryFamily(theme.typography.display),
      primaryFamily(theme.typography.body),
    ]),
  ];
  const params = families
    .filter(Boolean)
    .map(
      (f) =>
        `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700`,
    )
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

function stack(family: string, fallback: string) {
  return `"${primaryFamily(family)}", ${fallback}`;
}

export default function ThemeCard({
  theme,
  selected,
  onSelect,
  index,
}: ThemeCardProps) {
  const reduce = useReducedMotion();
  const display = stack(theme.typography.display, "ui-serif, Georgia, serif");
  const body = stack(
    theme.typography.body,
    "ui-sans-serif, system-ui, sans-serif",
  );
  const swatches = theme.palette.slice(0, 6);

  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 28,
        delay: reduce ? 0 : index * 0.08,
      }}
      whileHover={reduce ? undefined : { y: -4 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      className={`relative flex h-full flex-col overflow-hidden rounded-3xl border text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-accent ${
        selected
          ? "border-ink shadow-[0_24px_48px_-24px_rgb(0_0_0/0.35)]"
          : "border-line hover:border-ink/30"
      }`}
    >
      {/* React 19 hoists and dedupes this stylesheet into <head>. */}
      <link
        rel="stylesheet"
        href={themeFontsHref(theme)}
        precedence="theme-fonts"
      />

      <span
        className="flex min-h-44 flex-col justify-end gap-3 p-6"
        style={{
          background: swatches[0]?.hex ?? "var(--color-surface)",
          color: swatches[1]?.hex ?? "inherit",
        }}
      >
        <span
          className="block text-[28px] leading-[1.08] tracking-tight"
          style={{ fontFamily: display, fontWeight: 600 }}
        >
          {theme.sampleHeadline}
        </span>
        <span className="block text-sm opacity-80" style={{ fontFamily: body }}>
          {primaryFamily(theme.typography.display)} &amp;{" "}
          {primaryFamily(theme.typography.body)}
        </span>
      </span>

      <span className="flex h-3" aria-hidden>
        {swatches.map((s) => (
          <span
            key={s.hex + s.name}
            className="flex-1"
            style={{ background: s.hex }}
          />
        ))}
      </span>

      <span className="flex flex-1 flex-col gap-3 bg-surface p-6">
        <span className="flex items-center justify-between gap-3">
          <span className="text-xl font-semibold tracking-tight text-ink">
            {theme.name}
          </span>
          <SelectMark on={selected} />
        </span>
        <span className="text-[15px] leading-relaxed text-muted">
          {theme.premise}
        </span>
        {theme.voice && (
          <span className="text-sm leading-relaxed text-ink/80">
            <span className="text-muted">Voice: </span>
            {theme.voice}
          </span>
        )}
        <span className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {swatches.map((s) => (
            <span
              key={s.hex + s.name}
              className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted"
            >
              <span
                className="h-2.5 w-2.5 rounded-full border border-black/10"
                style={{ background: s.hex }}
              />
              {s.name}
            </span>
          ))}
        </span>
      </span>
    </motion.button>
  );
}

function SelectMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
        on ? "border-ink bg-ink text-bg" : "border-line"
      }`}
    >
      <motion.svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        initial={false}
        animate={{ opacity: on ? 1 : 0 }}
      >
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: on ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
        />
      </motion.svg>
    </span>
  );
}

export function ThemeCardSkeleton() {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-3xl border border-line"
      aria-hidden
    >
      <div className="h-44 animate-shimmer bg-line/70" />
      <div className="flex flex-col gap-3 bg-surface p-6">
        <div className="h-5 w-1/2 animate-pulse rounded-full bg-line/70" />
        <div className="h-4 w-full animate-pulse rounded-full bg-line/60" />
        <div className="h-4 w-4/5 animate-pulse rounded-full bg-line/60" />
        <div className="mt-3 flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-5 w-14 animate-pulse rounded-full bg-line/60"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
