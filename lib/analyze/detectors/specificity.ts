import type { TextBlock } from "@/lib/types";
import {
  type Detector,
  type DetectorResult,
  blocksMatching,
  boxesOf,
  countMatches,
  finding,
  fmt,
  humanList,
  pageText,
  plural,
  quote,
  sentences,
  status,
  words,
} from "./util";

/** Words and phrases that could describe any product. */
export const GENERIC_LEXICON: { term: string; re: RegExp }[] = [
  ["unlock", /\bunlock(s|ing|ed)?\b/],
  ["seamless", /\bseamless(ly)?\b/],
  ["supercharge", /\bsupercharg(e|es|ed|ing)\b/],
  ["elevate", /\belevat(e|es|ed|ing)\b/],
  ["game-changer", /\bgame[- ]?chang(er|ing)\b/],
  ["say goodbye to", /\bsay goodbye to\b/],
  ["revolutionize", /\brevolution(ize|ise|izing|ising|ary)?\b/],
  ["streamline", /\bstreamlin(e|es|ed|ing)\b/],
  ["empower", /\bempower(s|ing|ed)?\b/],
  ["leverage", /\bleverag(e|es|ing)\b/],
  ["cutting-edge", /\bcutting[- ]edge\b/],
  ["next-level", /\bnext[- ]level\b/],
  ["effortless", /\beffortless(ly)?\b/],
  ["harness the power", /\bharness(ing)? the power\b/],
  ["unleash", /\bunleash(es|ing|ed)?\b/],
  ["transform the way", /\btransform(s|ing)? (the way|how)\b/],
  ["blazing-fast", /\bblazing[- ]?fast\b/],
  ["robust", /\brobust\b/],
  ["world-class", /\b(world|best|first)[- ]class\b|\bbest[- ]in[- ]class\b/],
  ["innovative", /\binnovat(ive|ion)\b/],
  ["skyrocket", /\bskyrocket(s|ing)?\b/],
  ["full potential", /\b(your|their|its) full potential\b/],
  ["focus on what matters", /\bfocus on what (really |truly )?matters\b/],
  [
    "fast-paced world",
    /\bin today'?s (fast[- ]paced|digital|ever[- ]changing)\b/,
  ],
  ["take it to the next level", /\bto the next level\b/],
  ["all-in-one", /\ball[- ]in[- ]one\b/],
  ["powerful", /\bpowerful\b/],
  ["scalable", /\b(infinitely |highly )?scalable\b/],
  ["through the roof", /\bthrough the roof\b/],
  ["like never before", /\blike never before\b/],
].map(([term, re]) => ({
  term: term as string,
  re: new RegExp((re as RegExp).source, "i"),
}));

const NOT_X_BUT_Y_RE =
  /\b(?:it'?s|this is|that'?s)\s+not\s+(?:just\s+)?[^.,;—–]{1,40}[,;—–-]\s*(?:it'?s|this is|but)\b|\bnot just (?:a|an|the)?\s*[^.,;—–]{1,40}[,;—–-]?\s*(?:it'?s|but|this is)\b|\bisn'?t just\b|\bmore than just\b/i;
const FRAGMENT_TRIPLET_RE = /(?:^|\s)([\p{L}-]+\.\s+){2}[\p{L}-]+\.(?:\s|$)/u;
const LIST_TRIPLET_RE =
  /\b([\p{L}-]+(?:\s[\p{L}-]+)?),\s([\p{L}-]+(?:\s[\p{L}-]+)?),?\s(?:and|&)\s([\p{L}-]+(?:\s[\p{L}-]+)?)[.!]?$/u;
const NUMBER_RE =
  /(?:[$€£]\s?)?\b\d[\d,.]*\s?(?:%|x|k|m|h|hrs?|min|ms|s|days?|weeks?|months?|years?|\+)?(?![\p{L}])/gu;
const DATE_RE =
  /\b(19|20)\d{2}\b|\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?\s+\d{1,2}\b|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi;

/** Capitalised words that aren't sentence starts: a cheap proxy for names and places. */
function properNouns(text: string): number {
  let count = 0;
  for (const s of sentences(text)) {
    const tokens = s.split(/\s+/).filter((t) => /^\p{L}/u.test(t));
    const caps = tokens.filter((t) => /^\p{Lu}/u.test(t));
    // Title Case headings capitalise everything; they say nothing about names.
    if (tokens.length >= 3 && caps.length / tokens.length > 0.6) continue;
    for (const t of tokens.slice(1)) if (/^[A-Z][a-z]{2,}/.test(t)) count++;
  }
  return count;
}

function headingLike(b: TextBlock): boolean {
  return /^h[1-6]$/i.test(b.tag) || words(b.text).length <= 10;
}

export const detectSpecificity: Detector = (capture) => {
  const out: DetectorResult = { findings: [], statuses: [] };
  const text = pageText(capture);
  const wc = words(text).length;
  const blocks = capture.mobile.blocks.length
    ? capture.mobile.blocks
    : capture.desktop.blocks;

  // Generic lexicon.
  const hits = GENERIC_LEXICON.map(({ term, re }) => ({
    term,
    re,
    n: countMatches(text, re),
  })).filter((h) => h.n > 0);
  const total = hits.reduce((s, h) => s + h.n, 0);
  if (total > 0) {
    const examples = hits.flatMap(({ re }) =>
      sentences(text)
        .filter((s) => re.test(s))
        .slice(0, 1),
    );
    const matched = hits.flatMap(({ re }) =>
      blocksMatching(blocks, re).slice(0, 2),
    );
    out.findings.push(
      finding({
        id: "generic-lexicon",
        tenet: "specificity",
        severity: total >= 5 ? "high" : total >= 2 ? "medium" : "low",
        title: `${plural(total, "generic marketing word")}`,
        detail: `${humanList(hits.slice(0, 5).map((h) => `"${h.term}"`))} could describe any product, so they describe none.`,
        evidence: [...new Set(examples)].map((s) => quote(s)),
        boxes: boxesOf(matched),
        weight: 0.55,
      }),
    );
    const top = [...hits].sort((a, b) => b.n - a.n)[0]!;
    out.statuses.push(
      status(
        `${plural(total, "stock phrase")} found; "${top.term}" appears ${top.n === 1 ? "once" : `${top.n} times`}`,
        matched[0]?.box,
      ),
    );
  }

  // "It's not X, it's Y".
  const notX = sentences(text).filter((s) => NOT_X_BUT_Y_RE.test(s));
  if (notX.length) {
    const matched = blocksMatching(blocks, NOT_X_BUT_Y_RE);
    out.findings.push(
      finding({
        id: "not-x-but-y",
        tenet: "specificity",
        severity: notX.length >= 2 ? "medium" : "low",
        title:
          `"It's not X, it's Y" ${notX.length > 1 ? `${notX.length} times` : ""}`.trim(),
        detail:
          "The reframe sounds like insight but swaps one vague noun for another; say the concrete thing instead.",
        evidence: notX.map((s) => quote(s)),
        boxes: boxesOf(matched),
        weight: 0.3,
      }),
    );
  }

  // Reflexive triplets.
  const triplets = blocks.filter(
    (b) =>
      headingLike(b) &&
      (FRAGMENT_TRIPLET_RE.test(b.text.trim()) ||
        LIST_TRIPLET_RE.test(b.text.trim())),
  );
  if (triplets.length >= 2) {
    out.findings.push(
      finding({
        id: "triplets",
        tenet: "specificity",
        severity: triplets.length >= 4 ? "medium" : "low",
        title: `${triplets.length} reflexive triplets`,
        detail:
          "Groups of three adjectives are rhythm without content; one specific claim beats three vague ones.",
        evidence: triplets.map((b) => quote(b.text)),
        boxes: boxesOf(triplets),
        weight: 0.25,
      }),
    );
  }

  // Density of concrete detail.
  const numbers = countMatches(text, NUMBER_RE);
  const dates = countMatches(text, DATE_RE);
  const names = properNouns(text);
  const per100 = wc ? ((numbers + dates + names * 0.5) / wc) * 100 : 0;
  out.statuses.push(
    status(
      `${plural(numbers, "number")}, ${plural(dates, "date")} and ${plural(names, "proper noun")} in ${wc} words`,
    ),
  );
  if (wc >= 80 && per100 < 3) {
    out.findings.push(
      finding({
        id: "vague-copy",
        tenet: "specificity",
        severity: per100 < 1.5 ? "high" : "medium",
        title: "Almost no concrete detail",
        detail: `Only ${fmt(per100)} specifics per 100 words; numbers, names, places and dates are what make a claim believable.`,
        evidence: [
          `${numbers} numbers, ${dates} dates, ${names} names in ${wc} words`,
        ],
        weight: 0.45,
      }),
    );
  }

  return out;
};
