import { assertPublicUrl } from "@/lib/analyze/ssrf";
import { capturePage } from "@/lib/analyze/capture";
import { captureSaturated } from "@/lib/analyze/limits";
import { rateLimited } from "@/lib/rate-limit";
import { runDetectors } from "@/lib/analyze/detectors/index";
import { scoreReport } from "@/lib/analyze/score";
import { heuristicFacts, judgePage } from "@/lib/analyze/judge";
import { saveReport } from "@/lib/db/reports";
import { createSSE, sseResponse } from "@/lib/sse";
import {
  screenshotMime,
  type AnalyzeEvent,
  type Finding,
  type Metrics,
} from "@/lib/types";

// Capture + judge can take a while; Cache Components implies the Node runtime.
export const maxDuration = 300;

const yesNo = (v: unknown) => (v ? "yes" : "no");

const METRIC_LABELS: {
  [K in keyof Metrics]: (value: Metrics[K]) => string;
} = {
  mobileScreens: (v) => `${v.toFixed(1)} screens tall on mobile`,
  cls: (v) => `Layout shift while loading: ${v.toFixed(2)}`,
  lcp: (v) =>
    v === null
      ? "Largest paint: not measured"
      : `Largest paint: ${Math.round(v)}ms`,
  emojiCount: (v) => `${v} emoji`,
  emDashCount: (v) => `${v} em dashes`,
  wordCount: (v) => `${v} words`,
  distinctCtaLabels: (v) => `${v} distinct CTA labels`,
  headlineInFirstViewport: (v) => `Headline in first screen: ${yesNo(v)}`,
  ctaInFirstViewport: (v) => `CTA in first screen: ${yesNo(v)}`,
};

function metricLabel<K extends keyof Metrics>(
  key: K,
  value: Metrics[K],
): string {
  const format = METRIC_LABELS[key] as ((v: Metrics[K]) => string) | undefined;
  return format ? format(value) : String(key);
}

class Aborted extends Error {}

function pace(signal: AbortSignal): Promise<void> {
  const ms = 120 + Math.random() * 130;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Aborted());
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Aborted());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|getaddrinfo/i.test(msg))
    return "We couldn't find that domain. Check the URL and try again.";
  if (/timeout|timed out/i.test(msg))
    return "The page took too long to load. Try again, or try a lighter page.";
  if (/ERR_CONNECTION|ECONNREFUSED|ECONNRESET/i.test(msg))
    return "The site refused the connection.";
  if (/ERR_CERT|SSL|certificate/i.test(msg))
    return "The site's security certificate is invalid.";
  if (/executable|browserType\.launch|chromium/i.test(msg))
    return "Our page renderer is unavailable right now. Try again in a minute.";
  // Short, single-line messages (e.g. from the SSRF guard) are written for users already.
  if (
    msg &&
    msg.length < 140 &&
    !msg.includes("\n") &&
    !/^[A-Z_]+:|at\s/.test(msg)
  )
    return msg;
  return "Something went wrong while analyzing that page.";
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimited(request, "analyze");
  if (limited) return limited;
  if (captureSaturated()) {
    return Response.json(
      {
        error: "We're reading a lot of pages right now. Try again in a minute.",
      },
      { status: 429, headers: { "retry-after": "30" } },
    );
  }

  let rawUrl: unknown;
  try {
    rawUrl = ((await request.json()) as { url?: unknown })?.url;
  } catch {
    rawUrl = undefined;
  }

  const signal = request.signal;
  const sse = createSSE(signal);
  const send = (event: AnalyzeEvent) => sse.send(event);

  const run = async () => {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      throw new Error("Paste a full URL, like https://example.com.");
    }

    const target = await assertPublicUrl(rawUrl.trim());
    send({ type: "status", message: `Opening ${hostOf(target)}…` });

    const capture = await capturePage(
      target.toString(),
      (message: string) => send({ type: "status", message }),
      signal,
    );

    for (const vp of [capture.mobile, capture.desktop]) {
      send({
        type: "screenshot",
        viewport: vp.viewport,
        url: `data:${screenshotMime(vp)};base64,${vp.screenshot}`,
        fullHeight: vp.fullHeight,
        width: vp.width,
      });
    }

    const { findings, metrics, statuses } = runDetectors(capture);

    // The judge is the slow part: start it now, while the detector feed plays out.
    const judging = judgePage(capture, findings, signal).catch((err) => {
      console.error("[analyze] judge failed:", err);
      return null;
    });

    // Interleave detector statuses, findings and metrics so the feed feels alive.
    const metricEntries = (Object.keys(metrics) as (keyof Metrics)[]).map(
      (key) => ({
        key,
        value: metrics[key],
      }),
    );
    const shown: Finding[] = [];
    const steps = Math.max(
      statuses.length,
      findings.length,
      metricEntries.length,
    );
    for (let i = 0; i < steps; i++) {
      if (statuses[i]) send({ type: "status", ...statuses[i] });
      const finding = findings[i];
      if (finding) {
        shown.push(finding);
        send({ type: "finding", finding });
        send({ type: "score", score: scoreReport(shown) });
      }
      const metric = metricEntries[i];
      if (metric) {
        send({
          type: "metric",
          key: metric.key,
          value: metric.value,
          label: metricLabel(metric.key, metric.value),
        });
      }
      await pace(signal);
    }

    send({ type: "score", score: scoreReport(findings) });
    send({
      type: "status",
      message: "Reading it the way a first-time visitor would…",
    });

    const judged = await judging;
    if (signal.aborted) throw new Aborted();

    const allFindings = [...findings];
    if (judged) {
      if (judged.fiveSecond) {
        send({
          type: "status",
          message: `Five-second read: “${judged.fiveSecond.whatIsIt}”`,
          screenshot: "mobile",
        });
        await pace(signal);
      }
      for (const finding of judged.findings) {
        allFindings.push(finding);
        send({ type: "finding", finding });
        await pace(signal);
      }
    }

    const score = scoreReport(allFindings, judged?.tenetScores ?? null);
    send({ type: "score", score });
    send({ type: "status", message: "Saving your report…" });

    const report = await saveReport({
      report: {
        url: capture.finalUrl || capture.url,
        title: capture.title,
        metrics,
        findings: allFindings,
        uniqueness: judged?.uniqueness ?? [],
        fiveSecond: judged?.fiveSecond ?? null,
        score,
        productFacts: judged?.productFacts ?? heuristicFacts(capture),
      },
      capture,
    });

    send({ type: "done", report });
  };

  run()
    .catch((err) => {
      if (err instanceof Aborted || signal.aborted) return;
      console.error("[analyze] failed:", err);
      send({ type: "error", message: friendlyError(err) });
    })
    .finally(() => sse.close());

  return sseResponse(sse.stream);
}
