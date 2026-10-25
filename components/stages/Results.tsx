"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

import FindingCard from "@/components/FindingCard";
import SaveReport from "@/components/SaveReport";
import ScoreDial from "@/components/ScoreDial";
import { TENETS, tenetTitle } from "@/lib/tenets";
import type { Finding, Report, TenetId } from "@/lib/types";

interface ResultsProps {
  report: Report;
  selected: ReadonlySet<string>;
  onSelectedChange(next: Set<string>): void;
  onContinue(): void;
}

const spring = { type: "spring", stiffness: 280, damping: 30 } as const;

function verdict(total: number): string {
  if (total >= 75)
    return "This page could belong to anyone. Let's make it yours.";
  if (total >= 55)
    return "Mostly template, with a few real things buried underneath.";
  if (total >= 35)
    return "Some genuine signal, crowded out by familiar patterns.";
  if (total >= 15)
    return "Already fairly specific. A handful of tics to clean up.";
  return "This already reads like a person made it.";
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function Results({
  report,
  selected,
  onSelectedChange,
  onContinue,
}: ResultsProps) {
  const reduce = useReducedMotion();

  const groups = useMemo(() => {
    const byTenet = new Map<TenetId | "markers", Finding[]>();
    for (const f of report.findings) {
      byTenet.set(f.tenet, [...(byTenet.get(f.tenet) ?? []), f]);
    }
    return TENETS.filter((t) => byTenet.has(t.id)).map((t) => ({
      id: t.id,
      title: tenetTitle(t.id),
      slop: report.score.tenets.find((s) => s.tenet === t.id)?.slop ?? null,
      findings: byTenet
        .get(t.id)!
        .sort(
          (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
        ),
    }));
  }, [report.findings, report.score.tenets]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  const setGroup = (findings: Finding[], on: boolean) => {
    const next = new Set(selected);
    for (const f of findings) {
      if (on) next.add(f.id);
      else next.delete(f.id);
    }
    onSelectedChange(next);
  };

  const count = report.findings.filter((f) => selected.has(f.id)).length;

  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-60px" },
          transition: { ...spring, delay },
        };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-40 pt-12 sm:px-8 sm:pt-20">
      <motion.header
        {...reveal()}
        className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:gap-12"
      >
        <ScoreDial value={report.score.total} label="Slop score" size={168} />
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-muted">
            {hostOf(report.url)} · Grade {report.score.grade}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold text-ink sm:text-[56px]">
            {verdict(report.score.total)}
          </h1>
          <p className="text-lg text-muted">
            {report.findings.length}{" "}
            {report.findings.length === 1 ? "finding" : "findings"} across{" "}
            {groups.length} {groups.length === 1 ? "area" : "areas"}.{" "}
            {report.metrics.mobileScreens > 0 &&
              `${report.metrics.mobileScreens.toFixed(1)} screens tall on a phone.`}
          </p>
          {report.claimToken && (
            <div className="mt-1">
              <SaveReport reportId={report.id} claimToken={report.claimToken} />
            </div>
          )}
        </div>
      </motion.header>

      {report.fiveSecond && (
        <FiveSecondCard test={report.fiveSecond} reveal={reveal(0.08)} />
      )}

      <section className="mt-24" aria-labelledby="findings-heading">
        <div className="mb-10 flex flex-col gap-2">
          <h2
            id="findings-heading"
            className="text-3xl font-semibold text-ink sm:text-4xl"
          >
            What to fix
          </h2>
          <p className="max-w-xl text-lg text-muted">
            Everything is on by default. Switch off anything you want to keep as
            it is, and it stays out of the fix prompt.
          </p>
        </div>

        <div className="flex flex-col gap-16">
          {groups.map((g) => {
            const allOn = g.findings.every((f) => selected.has(f.id));
            return (
              <motion.div
                key={g.id}
                {...reveal()}
                className="flex flex-col gap-4"
              >
                <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <h3 className="text-xl font-semibold text-ink">
                      {g.title}
                    </h3>
                    {g.slop !== null && (
                      <span className="shrink-0 text-sm tabular-nums text-muted">
                        slop {Math.round(g.slop)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroup(g.findings, !allOn)}
                    className="shrink-0 text-sm text-muted transition-colors hover:text-ink"
                  >
                    {allOn ? "Keep all" : "Fix all"}
                  </button>
                </div>
                {g.findings.map((f) => (
                  <FindingCard
                    key={f.id}
                    finding={f}
                    selected={selected.has(f.id)}
                    onToggle={() => toggle(f.id)}
                    screenshots={report.screenshots}
                  />
                ))}
              </motion.div>
            );
          })}
          {groups.length === 0 && (
            <p className="text-lg text-muted">
              Nothing to fix. That is rare, and you should be proud.
            </p>
          )}
        </div>
      </section>

      {report.uniqueness.length > 0 && (
        <motion.section
          {...reveal()}
          className="mt-24"
          aria-labelledby="yours-heading"
        >
          <h2
            id="yours-heading"
            className="text-3xl font-semibold text-ink sm:text-4xl"
          >
            What&apos;s already yours
          </h2>
          <p className="mt-2 max-w-xl text-lg text-muted">
            Nobody else could have written these. The fix prompt tells your AI
            to keep them.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {report.uniqueness.map((u, i) => (
              <li
                key={i}
                className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6"
              >
                <span className="flex items-center gap-2 text-lg font-semibold text-ink">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-good"
                    aria-hidden
                  />
                  {u.title}
                </span>
                <span className="text-[15px] italic leading-relaxed text-muted">
                  “{u.evidence}”
                </span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <motion.div
          initial={reduce ? false : { y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...spring, delay: 0.3 }}
          className="pointer-events-auto mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-full border border-line bg-surface py-2 pl-5 pr-2 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.35)] sm:pl-6"
        >
          <span
            className="min-w-0 text-base font-semibold tabular-nums text-ink"
            aria-live="polite"
          >
            <AnimatedCount value={count} /> {count === 1 ? "fix" : "fixes"}
            <span className="max-sm:hidden"> selected</span>
          </span>
          <motion.button
            type="button"
            onClick={onContinue}
            whileHover={reduce ? undefined : { scale: 1.03 }}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            transition={spring}
            className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-5 text-base font-semibold text-bg sm:h-14 sm:px-8 sm:text-lg"
          >
            Get the fix prompt
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}

function AnimatedCount({ value }: { value: number }) {
  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function FiveSecondCard({
  test,
  reveal,
}: {
  test: NonNullable<Report["fiveSecond"]>;
  reveal: object;
}) {
  const rows = [
    { q: "What is it?", a: test.whatIsIt },
    { q: "Who is it for?", a: test.whoIsItFor },
    { q: "What do I do next?", a: test.whatDoIDoNext },
  ];
  return (
    <motion.section
      {...reveal}
      className="mt-16 overflow-hidden rounded-card border border-line bg-surface"
      aria-labelledby="five-second-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4 sm:px-8">
        <h2
          id="five-second-heading"
          className="text-base font-semibold text-ink"
        >
          The 5-second test
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            test.matchesPage ? "bg-good/12 text-good" : "bg-bad/12 text-bad"
          }`}
        >
          {test.matchesPage ? "A stranger got it" : "A stranger got it wrong"}
        </span>
      </div>
      <div className="grid gap-0 md:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <p className="text-sm text-muted">
            Shown only your first screen on a phone, for five seconds, a
            stranger said:
          </p>
          <dl className="flex flex-col gap-5">
            {rows.map((r) => (
              <div key={r.q} className="flex flex-col gap-1">
                <dt className="text-sm text-muted">{r.q}</dt>
                <dd className="text-lg leading-snug text-ink">
                  {r.a || "No idea."}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-col gap-2 border-t border-line bg-bg/50 p-6 sm:p-8 md:border-l md:border-t-0">
          <p className="text-sm text-muted">
            What the rest of the page actually says
          </p>
          <p className="text-lg leading-relaxed text-ink">{test.note}</p>
        </div>
      </div>
    </motion.section>
  );
}
