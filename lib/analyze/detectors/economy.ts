import type { ViewportCapture } from "@/lib/types";
import {
  type Detector,
  type DetectorResult,
  byY,
  finding,
  fmt,
  humanList,
  plural,
  quote,
  status,
  words,
} from "./util";

type Section = ViewportCapture["sections"][number];
export type SectionKind =
  | "hero"
  | "logos"
  | "features"
  | "testimonials"
  | "pricing"
  | "faq"
  | "cta"
  | "footer"
  | "other";

const TEMPLATE: SectionKind[] = [
  "hero",
  "logos",
  "features",
  "testimonials",
  "pricing",
  "faq",
  "cta",
];

export function classifySection(
  s: Section,
  index: number,
  total: number,
): SectionKind {
  const t = s.text;
  const wc = words(t).length;
  if (s.tag.toLowerCase() === "footer") return "footer";
  if (/\b(faq|frequently asked|common questions)\b/i.test(t)) return "faq";
  if (
    /([$€£]\s?\d|\/\s?mo\b|per (month|seat|user)|\bpricing\b|\bplans?\b.*\b(month|year)\b)/i.test(
      t,
    )
  )
    return "pricing";
  if (
    /\b(testimonials?|what (our )?(customers|users|people|clients) (say|are saying|think)|wall of love|hear from)\b/i.test(
      t,
    ) ||
    (t.match(/[“"]/g) ?? []).length >= 4
  ) {
    return "testimonials";
  }
  if (
    /\b(trusted by|used by|backed by|as seen (in|on)|loved by|powering|join(ed)? (over )?[\d,]+\+?)\b/i.test(
      t,
    ) &&
    wc < 30
  )
    return "logos";
  if (index === 0) return "hero";
  if (
    index >= total - 2 &&
    wc < 45 &&
    /\b(ready|get started|start|join|try|today)\b/i.test(t)
  )
    return "cta";
  if (s.childCount >= 3) return "features";
  return "other";
}

function lcs(a: SectionKind[], b: SectionKind[]): number {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]! + 1
          : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
  return dp[a.length]![b.length]!;
}

function shingles(text: string): Set<string> {
  const w = words(text.toLowerCase());
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++)
    out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export const detectEconomy: Detector = (capture) => {
  const out: DetectorResult = { findings: [], statuses: [] };
  const vp = capture.mobile;
  const screens = vp.height > 0 ? vp.fullHeight / vp.height : 0;

  out.statuses.push(status(`Page is ${fmt(screens)} screens tall on mobile`));
  if (screens > 8) {
    out.findings.push(
      finding({
        id: "too-long-mobile",
        tenet: "economy",
        severity: screens > 12 ? "high" : "medium",
        title: `${fmt(screens)} screens of scrolling on a phone`,
        detail:
          "Length should track the size of the ask; this much scroll for a self-serve product means sections that don't earn their place.",
        evidence: [`${Math.round(vp.fullHeight)}px tall at ${vp.width}px wide`],
        weight: 0.5,
      }),
    );
  }

  const sections = byY(
    vp.sections.length ? vp.sections : capture.desktop.sections,
  );

  // Near-duplicate sections.
  const sh = sections.map((s) => shingles(s.text));
  const dupes: [Section, Section, number][] = [];
  for (let i = 0; i < sections.length; i++)
    for (let j = i + 1; j < sections.length; j++) {
      const sim = jaccard(sh[i]!, sh[j]!);
      if (sim >= 0.35 && sh[i]!.size >= 8 && sh[j]!.size >= 8)
        dupes.push([sections[i]!, sections[j]!, sim]);
    }
  if (dupes.length) {
    out.findings.push(
      finding({
        id: "duplicate-sections",
        tenet: "economy",
        severity: dupes.length >= 2 ? "high" : "medium",
        title: `${plural(dupes.length, "pair")} of sections say the same thing`,
        detail:
          "Restating a section with a new heading adds scroll, not persuasion.",
        evidence: dupes.flatMap(([a, b]) => [
          quote(a.text, 80),
          quote(b.text, 80),
        ]),
        boxes: dupes.flatMap(([a, b]) => [a.box, b.box]),
        weight: 0.4,
      }),
    );
    out.statuses.push(
      status(
        `Two sections are ${Math.round(dupes[0]![2] * 100)}% the same words in a different order`,
        dupes[0]![1].box,
      ),
    );
  }

  // The stock template sequence.
  const kinds = sections
    .map((s, i) => classifySection(s, i, sections.length))
    .filter((k) => k !== "footer" && k !== "other");
  const deduped = kinds.filter((k, i) => k !== kinds[i - 1]);
  const match = lcs(deduped, TEMPLATE);
  if (match >= 5) {
    out.findings.push(
      finding({
        id: "template-sequence",
        tenet: "economy",
        severity: match >= 6 ? "high" : "medium",
        title: "Follows the stock landing-page template",
        detail:
          "Hero, logo strip, feature grid, testimonials, pricing, FAQ, CTA: the order nobody chose, which is why every page like this feels the same.",
        evidence: [deduped.join(" → ")],
        boxes: sections.slice(0, 7).map((s) => s.box),
        weight: 0.45,
      }),
    );
    out.statuses.push(
      status(`Section order: ${humanList(deduped)}. Bingo, ${match} of 7.`),
    );
  } else if (deduped.length) {
    out.statuses.push(
      status(
        `${plural(sections.length, "section")}; only ${match} of the 7 stock template steps`,
      ),
    );
  }

  return out;
};
