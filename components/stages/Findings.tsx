"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import FindingCard from "@/components/FindingCard";
import ScoreDial from "@/components/ScoreDial";
import ThemeCard, { ThemeCardSkeleton } from "@/components/ThemeCard";
import { TENETS, tenetTitle } from "@/lib/tenets";
import type {
  Finding,
  InterviewAnswers,
  Report,
  TenetId,
  Theme,
  ThemesRequest,
} from "@/lib/types";

interface FindingsProps {
  report: Report;
  answers: InterviewAnswers;
  onDeslop(theme: Theme, selectedFindingIds: string[]): void;
}

const spring = { type: "spring", stiffness: 280, damping: 30 } as const;

// Survive remounts (strict mode, or coming back from Compare via "Edit fixes")
// without refetching themes or forgetting the reader's choices.
const themeRequests = new Map<string, Promise<Theme[]>>();
const memory = new Map<string, { selected: string[]; theme: number | null }>();

function fetchThemes(
  report: Report,
  answers: InterviewAnswers,
  fresh = false,
): Promise<Theme[]> {
  const key = report.id;
  const cached = themeRequests.get(key);
  if (cached && !fresh) return cached;
  const body: ThemesRequest = {
    reportId: report.id,
    claimToken: report.claimToken,
    answers,
    report: {
      url: report.url,
      title: report.title,
      productFacts: report.productFacts,
      uniqueness: report.uniqueness,
      findings: report.findings,
    },
  };
  const request = fetch("/api/themes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Could not propose themes (${res.status}).`);
      const data = (await res.json()) as { themes?: Theme[] };
      if (!data.themes?.length) throw new Error("No themes came back.");
      return data.themes;
    })
    .catch((err) => {
      themeRequests.delete(key);
      throw err;
    });
  themeRequests.set(key, request);
  return request;
}

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

export default function Findings({ report, answers, onDeslop }: FindingsProps) {
  const reduce = useReducedMotion();
  const remembered = memory.get(report.id);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(remembered?.selected ?? report.findings.map((f) => f.id)),
  );
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<number | null>(
    remembered?.theme ?? null,
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    memory.set(report.id, { selected: [...selected], theme: chosen });
  }, [report.id, selected, chosen]);

  useEffect(() => {
    let live = true;
    fetchThemes(report, answers, attempt > 0)
      .then((t) => {
        if (!live) return;
        setThemes(t);
        if (attempt > 0) setChosen(null);
      })
      .catch((err: Error) => live && setThemeError(err.message));
    return () => {
      live = false;
    };
    // Answers are fixed by the time findings show; refetch only on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, attempt]);

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

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setGroup = (findings: Finding[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of findings) {
        if (on) next.add(f.id);
        else next.delete(f.id);
      }
      return next;
    });

  const theme = chosen !== null ? themes?.[chosen] : undefined;
  const count = selected.size;
  const host = (() => {
    try {
      return new URL(report.url).hostname.replace(/^www\./, "");
    } catch {
      return report.url;
    }
  })();

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
    <div className="mx-auto w-full max-w-5xl px-5 pb-40 pt-24 sm:px-8 sm:pt-28">
      {/* Header */}
      <motion.header
        {...reveal()}
        className="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:gap-12"
      >
        <ScoreDial value={report.score.total} label="Slop score" size={168} />
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-muted">
            {host} · Grade {report.score.grade}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold text-ink sm:text-[56px]">
            {verdict(report.score.total)}
          </h1>
          <p className="text-lg text-muted">
            {report.findings.length} findings across {groups.length} areas.{" "}
            {report.metrics.mobileScreens > 0 &&
              `${report.metrics.mobileScreens.toFixed(1)} screens tall on a phone.`}
          </p>
        </div>
      </motion.header>

      {report.fiveSecond && (
        <FiveSecondCard test={report.fiveSecond} reveal={reveal(0.08)} />
      )}

      {/* Findings by tenet */}
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
            it is.
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
                  <div className="flex items-baseline gap-3">
                    <h3 className="text-xl font-semibold text-ink">
                      {g.title}
                    </h3>
                    {g.slop !== null && (
                      <span className="text-sm tabular-nums text-muted">
                        slop {Math.round(g.slop)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroup(g.findings, !allOn)}
                    className="text-sm text-muted transition-colors hover:text-ink"
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

      {/* Uniqueness */}
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
            The new page keeps these. Nobody else could have written them.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {report.uniqueness.map((u, i) => (
              <li
                key={i}
                className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6"
              >
                <span className="flex items-center gap-2 text-lg font-semibold text-ink">
                  <span className="h-2 w-2 rounded-full bg-good" aria-hidden />
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

      {/* Themes */}
      <section className="mt-24" aria-labelledby="themes-heading">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2
              id="themes-heading"
              className="text-3xl font-semibold text-ink sm:text-4xl"
            >
              Pick a direction
            </h2>
            <p className="max-w-xl text-lg text-muted">
              Three concepts built from your answers. Each one is a point of
              view, not a palette swap.
            </p>
          </div>
          {themes && (
            <button
              type="button"
              onClick={() => {
                setThemes(null);
                setThemeError(null);
                setAttempt((a) => a + 1);
              }}
              className="h-10 rounded-full border border-line px-4 text-sm text-muted transition-colors hover:text-ink"
            >
              Three more
            </button>
          )}
        </div>

        {themeError ? (
          <div className="flex flex-col items-start gap-4 rounded-card border border-line bg-surface p-8">
            <p className="text-lg text-ink">{themeError}</p>
            <button
              type="button"
              onClick={() => {
                setThemeError(null);
                setAttempt((a) => a + 1);
              }}
              className="h-11 rounded-full bg-ink px-5 text-sm font-semibold text-bg"
            >
              Try again
            </button>
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label="Themes"
            className="grid gap-5 md:grid-cols-3"
          >
            {themes
              ? themes.map((t, i) => (
                  <ThemeCard
                    key={`${attempt}-${t.name}`}
                    theme={t}
                    index={i}
                    selected={chosen === i}
                    onSelect={() => setChosen(i)}
                  />
                ))
              : [0, 1, 2].map((i) => <ThemeCardSkeleton key={i} />)}
          </div>
        )}
        {!themes && !themeError && (
          <p className="mt-5 text-sm text-muted" role="status">
            Sketching three directions from your answers…
          </p>
        )}
      </section>

      {/* Sticky action bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <motion.div
          initial={reduce ? false : { y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...spring, delay: 0.3 }}
          className="pointer-events-auto mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-full border border-line bg-surface py-2 pl-6 pr-2 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.35)]"
        >
          <div className="flex min-w-0 flex-col">
            <span
              className="text-base font-semibold tabular-nums text-ink"
              aria-live="polite"
            >
              <AnimatedCount value={count} /> {count === 1 ? "fix" : "fixes"}{" "}
              selected
            </span>
            <span className="truncate text-sm text-muted">
              {theme ? theme.name : "Choose a direction to continue"}
            </span>
          </div>
          <motion.button
            type="button"
            disabled={!theme}
            onClick={() => theme && onDeslop(theme, [...selected])}
            whileHover={theme && !reduce ? { scale: 1.03 } : undefined}
            whileTap={theme && !reduce ? { scale: 0.97 } : undefined}
            transition={spring}
            className="h-14 shrink-0 rounded-full bg-ink px-7 text-lg font-semibold text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-35 sm:px-10"
          >
            Deslop it
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
