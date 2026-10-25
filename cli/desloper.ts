// The command-line version: same capture, detectors, score and fix prompt as
// the web app, run against any URL (localhost included), a local HTML file or
// a README, which is scored against the README reading of the doctrine.
// The judge is optional here; a coding agent can write the judgement instead.

import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { closeBrowser } from "@/lib/analyze/browser";
import { captureHtml, captureLocal } from "@/lib/analyze/capture";
import { runDetectors } from "@/lib/analyze/detectors/index";
import {
  acceptJudgement,
  buildContext,
  heuristicFacts,
  judgePage,
  type JudgeResult,
} from "@/lib/analyze/judge";
import { scoreReport } from "@/lib/analyze/score";
import { doctrinePrompt } from "@/lib/doctrine";
import { buildFixPrompt, type FixPromptReport } from "@/lib/fix-prompt";
import {
  buildReadmeFixPrompt,
  detectReadme,
  README_DETECTOR_IDS,
  README_TENET_WEIGHTS,
  readmeDoctrinePrompt,
  readmeTitle,
  renderReadme,
} from "@/lib/readme";
import { tenetTitle } from "@/lib/tenets";
import type {
  Capture,
  Finding,
  InterviewAnswers,
  Metrics,
  ViewportCapture,
} from "@/lib/types";

const USAGE = `desloper: score how generic a landing page or README is, and write the prompt that fixes it.

  desloper analyze <url | file.html | file.md | readme> [--out <dir>] [--judge]
      Renders the page at 1440px and 390px, runs the detectors and writes the
      run to <dir>: screenshots, page text, the judge's context, findings.
      localhost works. An HTML file renders without JavaScript or local assets.
      A Markdown file, or "readme" for the README in this directory, is scored
      as a README: only the writing checks, plus README-only ones.
      --judge also runs the model judge on pages (needs AI_GATEWAY_API_KEY).

  desloper finish <dir> [--judgement <file>] [--skip <id,id>] [--answers <file>]
      Merges a judgement into the run, scores it and writes report.json and
      fix-prompt.md. --skip leaves findings out of the prompt. --answers is a
      JSON file of the optional interview answers (story, pain, customer, ...).

  desloper doctrine [--readme]
      Prints the eight principles every page is judged against, or the
      README reading of them.`;

/** Everything `finish` needs, minus the screenshots (those are files). */
interface Run {
  capture: Capture;
  findings: Finding[];
  metrics: Metrics;
  /** Set when the run is a README rather than a page. */
  readme?: { path: string };
}

interface Target {
  page: Capture;
  readme?: { path: string; markdown: string };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function stripScreenshots(vp: ViewportCapture): ViewportCapture {
  return { ...vp, screenshot: "", firstViewport: "" };
}

function extension(vp: ViewportCapture): string {
  return vp.screenshotType === "image/jpeg" ? "jpg" : "png";
}

function defaultOutDir(target: string): string {
  let name = basename(target);
  try {
    name = new URL(target).host;
  } catch {
    /* a file path */
  }
  const slug = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return join(tmpdir(), "desloper", `${slug || "page"}-${stamp}`);
}

/** Picks up the gateway key from the repo's own env files, as `next dev` would. */
function loadRepoEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(import.meta.dirname, "..", file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

function formatMetrics(m: Metrics, readme: boolean): string[] {
  if (readme)
    return [
      `${m.wordCount} words`,
      `${m.emojiCount} emoji, ${m.emDashCount} em dashes`,
    ];
  const yesNo = (v: boolean) => (v ? "yes" : "no");
  return [
    `${m.mobileScreens.toFixed(1)} screens tall on mobile`,
    `headline in first screen: ${yesNo(m.headlineInFirstViewport)}, CTA in first screen: ${yesNo(m.ctaInFirstViewport)}`,
    `${m.distinctCtaLabels} distinct CTA labels, ${m.wordCount} words`,
    `${m.emojiCount} emoji, ${m.emDashCount} em dashes`,
    `CLS ${m.cls.toFixed(2)}, LCP ${m.lcp == null ? "not measured" : `${m.lcp}ms`}`,
  ];
}

function formatFindings(findings: Finding[]): string[] {
  return findings.map((f) => {
    const evidence = f.evidence.length
      ? ` (${f.evidence
          .slice(0, 2)
          .map((e) => `"${e.length > 80 ? `${e.slice(0, 79)}…` : e}"`)
          .join(", ")})`
      : "";
    return `- [${f.id}] ${tenetTitle(f.tenet)}, ${f.severity}: ${f.title}${evidence}`;
  });
}

/** "readme" means the README in the current directory, whatever its casing. */
function findReadme(): string {
  const names = readdirSync(process.cwd()).filter((n) =>
    /^readme(\.(md|markdown))?$/i.test(n),
  );
  const name = names.find((n) => /\.md$/i.test(n)) ?? names[0];
  if (!name) fail(`No README in ${process.cwd()}.`);
  return resolve(name);
}

async function capture(target: string): Promise<Target> {
  const status = (m: string) => console.error(`  ${m}`);
  if (/^https?:\/\//i.test(target))
    return { page: await captureLocal(target, status) };
  if (/^[a-z]+:\/\//i.test(target))
    fail("Use an http(s) URL, an HTML file or a Markdown file.");
  const path =
    target.toLowerCase() === "readme" && !existsSync(target)
      ? findReadme()
      : resolve(target);
  if (existsSync(path)) {
    const url = pathToFileURL(path).href;
    if (/\.(md|markdown)$/i.test(path) || /^readme$/i.test(basename(path))) {
      const markdown = await readFile(path, "utf8");
      const title = readmeTitle(markdown, basename(path));
      const page = await captureHtml(renderReadme(markdown, title), status);
      return {
        page: { ...page, url, finalUrl: url },
        readme: { path, markdown },
      };
    }
    const page = await captureHtml(await readFile(path, "utf8"), status);
    return { page: { ...page, url, finalUrl: url } };
  }
  // A bare host, like "localhost:3000" or "example.com".
  const local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(target);
  return {
    page: await captureLocal(`${local ? "http" : "https"}://${target}`, status),
  };
}

async function analyze(target: string, out: string, judge: boolean) {
  await mkdir(out, { recursive: true });
  console.error(`Reading ${target}`);
  const { page, readme } = await capture(target);
  const detected = runDetectors(page);
  const { metrics } = detected;
  const findings = readme
    ? [
        ...detected.findings.filter((f) => README_DETECTOR_IDS.has(f.id)),
        ...detectReadme(readme.markdown),
      ]
    : detected.findings;

  const shots: Record<string, string> = {};
  for (const vp of [page.mobile, page.desktop]) {
    const ext = extension(vp);
    shots[`${vp.viewport}.${ext}`] = vp.screenshot;
    shots[`${vp.viewport}-first.png`] = vp.firstViewport;
  }
  for (const [name, base64] of Object.entries(shots))
    if (base64) await writeFile(join(out, name), Buffer.from(base64, "base64"));

  let judged: JudgeResult | null = null;
  if (judge && readme) {
    console.error("  The model judge reads pages, not READMEs; skipping it.");
  } else if (judge) {
    loadRepoEnv();
    console.error("  Asking the judge");
    judged = await judgePage(page, findings);
    if (!Object.keys(judged.tenetScores).length)
      console.error("  The judge was unavailable; detectors only.");
    else
      await writeFile(
        join(out, "judgement-result.json"),
        JSON.stringify(judged, null, 2),
      );
  }

  const run: Run = {
    capture: {
      ...page,
      html: "",
      snapshotHtml: "",
      mobile: stripScreenshots(page.mobile),
      desktop: stripScreenshots(page.desktop),
    },
    findings,
    metrics,
    readme: readme && { path: readme.path },
  };
  await writeFile(join(out, "run.json"), JSON.stringify(run));
  await writeFile(join(out, "page.txt"), page.visibleText);
  await writeFile(join(out, "context.md"), buildContext(page, findings));

  const all = [...findings, ...(judged?.findings ?? [])];
  const score = scoreReport(
    all,
    judged?.tenetScores,
    readme ? README_TENET_WEIGHTS : undefined,
  );
  console.log(
    [
      `${score.total} ${score.grade}  ${page.title || page.finalUrl}`,
      `${readme ? "README, " : ""}${judged && Object.keys(judged.tenetScores).length ? "detectors + judge" : "detectors only"}`,
      "",
      ...formatMetrics(metrics, Boolean(readme)),
      "",
      `${all.length} findings:`,
      ...formatFindings(all),
      "",
      `Run saved to ${out}`,
      `Screenshots: ${Object.keys(shots).join(", ")}`,
      "Page text: page.txt  Judge context: context.md",
    ].join("\n"),
  );
}

async function finish(
  dir: string,
  opts: { judgement?: string; skip: string[]; answers?: string },
) {
  const runPath = join(dir, "run.json");
  if (!existsSync(runPath))
    fail(`No run in ${dir}. Run "desloper analyze" first.`);
  const run = JSON.parse(await readFile(runPath, "utf8")) as Run;

  let judged: JudgeResult | null = null;
  if (opts.judgement) {
    const raw = JSON.parse(await readFile(resolve(opts.judgement), "utf8"));
    judged = acceptJudgement(raw, run.capture);
    const offered = Array.isArray(raw?.findings) ? raw.findings.length : 0;
    if (offered > judged.findings.length)
      console.error(
        `  Dropped ${offered - judged.findings.length} judge finding(s) whose quotes are not on the page.`,
      );
  } else if (existsSync(join(dir, "judgement-result.json"))) {
    judged = JSON.parse(
      await readFile(join(dir, "judgement-result.json"), "utf8"),
    ) as JudgeResult;
  }

  const findings = [...run.findings, ...(judged?.findings ?? [])];
  const report: FixPromptReport = {
    url: run.capture.finalUrl || run.capture.url,
    title: run.capture.title,
    metrics: run.metrics,
    findings,
    uniqueness: judged?.uniqueness ?? [],
    fiveSecond: judged?.fiveSecond ?? null,
    score: scoreReport(
      findings,
      judged?.tenetScores,
      run.readme ? README_TENET_WEIGHTS : undefined,
    ),
    productFacts: judged?.productFacts ?? heuristicFacts(run.capture),
  };

  const skip = new Set(opts.skip);
  const unknown = opts.skip.filter((id) => !findings.some((f) => f.id === id));
  if (unknown.length)
    console.error(`  No finding with id ${unknown.join(", ")}`);
  const answers = opts.answers
    ? (JSON.parse(
        await readFile(resolve(opts.answers), "utf8"),
      ) as InterviewAnswers)
    : undefined;

  const selectedFindingIds = findings
    .filter((f) => !skip.has(f.id))
    .map((f) => f.id);
  const prompt = run.readme
    ? buildReadmeFixPrompt({
        ...report,
        path: relative(process.cwd(), run.readme.path) || run.readme.path,
        selectedFindingIds,
        answers,
      })
    : buildFixPrompt({ report, selectedFindingIds, answers });
  await writeFile(join(dir, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(join(dir, "fix-prompt.md"), prompt);

  const { score } = report;
  console.log(
    [
      `${score.total} ${score.grade}  ${report.title || report.url}`,
      ...score.tenets.map(
        (t) =>
          `  ${tenetTitle(t.tenet)}: ${t.slop} (detectors ${t.detector}${t.judge == null ? "" : `, judge ${t.judge}`})`,
      ),
      `  AI markers penalty: ${score.markersPenalty}`,
      "",
      `${findings.length - skip.size} of ${findings.length} findings in the prompt:`,
      ...formatFindings(findings.filter((f) => !skip.has(f.id))),
      "",
      `Fix prompt: ${join(dir, "fix-prompt.md")}`,
      `Report: ${join(dir, "report.json")}`,
    ].join("\n"),
  );
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      judge: { type: "boolean", default: false },
      judgement: { type: "string" },
      skip: { type: "string" },
      answers: { type: "string" },
      readme: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, arg] = positionals;

  if (values.help || !command) return console.log(USAGE);
  if (command === "doctrine")
    return console.log(
      values.readme ? readmeDoctrinePrompt() : doctrinePrompt(),
    );
  if (command === "analyze") {
    if (!arg) fail(USAGE);
    return analyze(
      arg,
      resolve(values.out ?? defaultOutDir(arg)),
      values.judge,
    );
  }
  if (command === "finish") {
    if (!arg) fail(USAGE);
    return finish(resolve(arg), {
      judgement: values.judgement,
      skip: (values.skip ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      answers: values.answers,
    });
  }
  fail(USAGE);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeBrowser());
