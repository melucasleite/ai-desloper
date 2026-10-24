import {
  type Detector,
  type DetectorResult,
  finding,
  fmt,
  status,
} from "./util";

const WEB_FONT_RE =
  /@font-face|fonts\.googleapis\.com|fonts\.bunny\.net|use\.typekit\.net|\.woff2?\b/i;
const FONT_METRICS_RE =
  /size-adjust|ascent-override|font-display\s*:\s*optional/i;

export const detectSpeed: Detector = (capture) => {
  const out: DetectorResult = { findings: [], statuses: [] };
  const { cls, lcp } = capture;

  out.statuses.push(
    status(
      cls >= 0.1
        ? `Layout shifted ${fmt(cls, 2)} while loading`
        : `Layout held still (CLS ${fmt(cls, 3)})`,
    ),
  );
  if (cls >= 0.1) {
    out.findings.push(
      finding({
        id: "high-cls",
        tenet: "speed",
        severity: cls >= 0.25 ? "high" : "medium",
        title: `Layout shift of ${fmt(cls, 2)}`,
        detail:
          "Content jumps while the page loads, so people tap the wrong thing or lose their place; aim for under 0.1.",
        evidence: [`CLS ${fmt(cls, 3)}`],
        weight: 0.6,
      }),
    );
  }

  if (lcp == null) {
    out.statuses.push(
      status("Largest paint wasn't reported; skipping that one"),
    );
  } else {
    out.statuses.push(
      status(`Largest content painted at ${fmt(lcp / 1000, 1)}s`),
    );
    if (lcp > 2500) {
      out.findings.push(
        finding({
          id: "slow-lcp",
          tenet: "speed",
          severity: lcp > 4000 ? "high" : "medium",
          title: `Main content appears after ${fmt(lcp / 1000, 1)}s`,
          detail:
            "Largest contentful paint over 2.5s means many visitors are looking at a blank or half-built page.",
          evidence: [`LCP ${Math.round(lcp)}ms`],
          weight: 0.5,
        }),
      );
    }
  }

  if (
    cls >= 0.05 &&
    WEB_FONT_RE.test(capture.html) &&
    !FONT_METRICS_RE.test(capture.html)
  ) {
    out.findings.push(
      finding({
        id: "font-swap-shift",
        tenet: "speed",
        severity: "low",
        title: "Web fonts likely reflow the page",
        detail:
          "Fonts load without metric overrides, so text reflows when they swap in; match the fallback or use font-display: optional.",
        weight: 0.25,
      }),
    );
  }

  return out;
};
