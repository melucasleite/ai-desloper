import {
  type Detector,
  type DetectorResult,
  findHeadline,
  findPrimaryCta,
  findSubhead,
  finding,
  fmt,
  inFirstViewport,
  plural,
  quote,
  screensDown,
  status,
  words,
} from "./util";

/** Headlines that name the category instead of the problem. */
export const CATEGORY_RE =
  /\b(ai[- ]powered|ai[- ]driven|all[- ]in[- ]one|next[- ]gen(eration)?|the future of|revolutioni[sz]e|platform (for|to|that)|solution (for|to|that)|one[- ]stop|the (ultimate|only|smarter|modern) (way|platform|tool|solution)|supercharge your|unleash|empower(ing)? (your|teams|businesses))\b/i;

const MAX_HEADLINE_WORDS = 12;

export const detectPain: Detector = (capture) => {
  const vp = capture.mobile;
  const out: DetectorResult = { findings: [], statuses: [] };
  const headline = findHeadline(vp);
  const subhead = findSubhead(vp, headline);
  const cta = findPrimaryCta(vp);

  if (!headline) {
    out.findings.push(
      finding({
        id: "no-headline",
        tenet: "pain",
        severity: "high",
        title: "No headline in the first screen",
        detail:
          "Without a headline, visitors have to guess what the page is about before they leave.",
        weight: 0.7,
      }),
    );
    out.statuses.push(
      status(`Looked for a headline at ${vp.width}px and found none`),
    );
  } else {
    const headlineIn = inFirstViewport(headline.box, vp);
    if (!headlineIn) {
      out.findings.push(
        finding({
          id: "headline-below-fold",
          tenet: "pain",
          severity: "high",
          title: "Headline starts below the first screen",
          detail: `On a ${vp.width}px phone the headline sits ${fmt(screensDown(headline.box, vp))} screens down, so the first thing people see says nothing.`,
          evidence: [quote(headline.text)],
          boxes: [headline.box],
          weight: 0.6,
        }),
      );
    }

    const wc = words(headline.text).length;
    if (wc > MAX_HEADLINE_WORDS) {
      out.findings.push(
        finding({
          id: "headline-too-long",
          tenet: "pain",
          severity: wc > 18 ? "medium" : "low",
          title: `Headline runs ${wc} words`,
          detail:
            "A headline should read in one glance; past a dozen words it becomes a paragraph people skip.",
          evidence: [quote(headline.text)],
          boxes: [headline.box],
          weight: 0.3,
        }),
      );
    }

    const categoryHit = [headline, subhead].find(
      (b) => b && CATEGORY_RE.test(b.text),
    );
    if (categoryHit) {
      const phrase = categoryHit.text.match(CATEGORY_RE)?.[0] ?? "";
      out.findings.push(
        finding({
          id: "category-headline",
          tenet: "pain",
          severity: categoryHit === headline ? "high" : "medium",
          title: "Opens with the category, not the pain",
          detail: `"${phrase}" describes what kind of product this is, not the problem it makes go away.`,
          evidence: [quote(categoryHit.text)],
          boxes: [categoryHit.box],
          weight: 0.55,
        }),
      );
      out.statuses.push(
        status(
          `Headline leans on "${phrase}", which describes a few thousand other products too`,
          categoryHit.box,
        ),
      );
    } else {
      out.statuses.push(
        status(
          `Headline reads "${quote(headline.text, 70)}" (${plural(wc, "word")})`,
          headline.box,
        ),
      );
    }

    if (subhead && words(subhead.text).length > 35) {
      out.findings.push(
        finding({
          id: "subhead-rambles",
          tenet: "pain",
          severity: "low",
          title: "Subhead is a paragraph",
          detail:
            "The subhead should say how in one sentence; this one asks for a reading commitment before the visitor has one.",
          evidence: [quote(subhead.text)],
          boxes: [subhead.box],
          weight: 0.2,
        }),
      );
    }
  }

  if (!cta) {
    out.findings.push(
      finding({
        id: "no-cta",
        tenet: "pain",
        severity: "high",
        title: "No primary action anywhere on mobile",
        detail:
          "There is no button to press, so even a convinced visitor has nowhere to go.",
        weight: 0.7,
      }),
    );
    out.statuses.push(status("No button found on the mobile page at all"));
  } else if (!inFirstViewport(cta.box, vp)) {
    const down = screensDown(cta.box, vp);
    out.findings.push(
      finding({
        id: "cta-below-fold",
        tenet: "pain",
        severity: down > 1.5 ? "high" : "medium",
        title: "Primary action is below the first screen",
        detail: `"${quote(cta.text, 40)}" sits ${fmt(down)} screens down on a ${vp.width}px phone; most visitors decide before they get there.`,
        evidence: [quote(cta.text, 60)],
        boxes: [cta.box],
        weight: 0.6,
      }),
    );
    const headlineIn = headline && inFirstViewport(headline.box, vp);
    out.statuses.push(
      status(
        headlineIn
          ? `Your headline is visible, your CTA is ${fmt(down)} screens down`
          : `First button shows up ${fmt(down)} screens down`,
        cta.box,
      ),
    );
  } else if (headline && inFirstViewport(headline.box, vp)) {
    out.statuses.push(
      status(
        `Headline and "${quote(cta.text, 40)}" both fit in the first screen`,
        cta.box,
      ),
    );
  }

  return out;
};
