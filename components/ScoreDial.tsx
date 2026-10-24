"use client";

import { useEffect } from "react";
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

interface Props {
  /** 0..100, higher = sloppier. */
  value: number;
  label?: string;
  size?: number;
}

export default function ScoreDial({ value, label, size = 120 }: Props) {
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(100, value));
  const spring = useSpring(0, { stiffness: 55, damping: 18, mass: 1 });

  useEffect(() => {
    if (reduced) spring.jump(target);
    else spring.set(target);
  }, [target, reduced, spring]);

  const stroke = Math.max(3, Math.round(size / 22));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  const dashOffset = useTransform(spring, (v) => circumference * (1 - v / 100));
  const color = useTransform(
    spring,
    (v) =>
      `color-mix(in oklab, var(--color-bad) ${Math.round(Math.min(100, v * 1.25))}%, var(--color-muted))`,
  );
  const display = useTransform(spring, (v) => Math.round(v).toString());

  return (
    <div
      className="relative inline-flex shrink-0 flex-col items-center"
      style={{ width: size }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{ strokeDashoffset: dashOffset, stroke: color }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className="font-semibold tracking-tight tabular-nums"
            style={{ fontSize: size * 0.3, color }}
            role="img"
            aria-label={`${label ?? "Score"} ${Math.round(target)} out of 100`}
          >
            {display}
          </motion.span>
        </div>
      </div>
      {label ? (
        <span className="mt-2 text-xs font-medium tracking-wide text-muted uppercase">
          {label}
        </span>
      ) : null}
    </div>
  );
}
