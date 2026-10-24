import type { Capture, Finding, Metrics } from "@/lib/types";
import { detectAction } from "./action";
import { detectEconomy } from "./economy";
import { detectIdentity } from "./identity";
import { detectMarkers } from "./markers";
import { detectPain } from "./pain";
import { detectShow } from "./show";
import { detectSpecificity } from "./specificity";
import { detectSpeed } from "./speed";
import {
  type Detector,
  type DetectorStatus,
  distinctCtaLabels,
  emojiList,
  findHeadline,
  findPrimaryCta,
  inFirstViewport,
  pageText,
  words,
} from "./util";
import { detectVoice } from "./voice";

export type { DetectorStatus } from "./util";

/** Ordered so the live feed reads like someone looking at the page top-down. */
const DETECTORS: [string, Detector][] = [
  ["pain", detectPain],
  ["economy", detectEconomy],
  ["markers", detectMarkers],
  ["action", detectAction],
  ["specificity", detectSpecificity],
  ["show", detectShow],
  ["voice", detectVoice],
  ["identity", detectIdentity],
  ["speed", detectSpeed],
];

export function computeMetrics(capture: Capture): Metrics {
  const vp = capture.mobile;
  const text = pageText(capture);
  const headline = findHeadline(vp);
  const cta = findPrimaryCta(vp);
  return {
    mobileScreens:
      vp.height > 0 ? Math.round((vp.fullHeight / vp.height) * 10) / 10 : 0,
    cls: Math.round(capture.cls * 1000) / 1000,
    lcp: capture.lcp == null ? null : Math.round(capture.lcp),
    emojiCount: emojiList(text).length,
    emDashCount: (text.match(/—/g) ?? []).length,
    wordCount: words(text).length,
    distinctCtaLabels: distinctCtaLabels(capture).size,
    headlineInFirstViewport: !!headline && inFirstViewport(headline.box, vp),
    ctaInFirstViewport: !!cta && inFirstViewport(cta.box, vp),
  };
}

export function runDetectors(capture: Capture): {
  findings: Finding[];
  metrics: Metrics;
  statuses: DetectorStatus[];
} {
  const findings: Finding[] = [];
  const statuses: DetectorStatus[] = [];
  for (const [name, detect] of DETECTORS) {
    try {
      const r = detect(capture);
      findings.push(...r.findings);
      statuses.push(...r.statuses);
    } catch (err) {
      // One broken heuristic shouldn't sink the whole report.
      console.error(`[detectors] ${name} failed`, err);
    }
  }
  return { findings, metrics: computeMetrics(capture), statuses };
}
