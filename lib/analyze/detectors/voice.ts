import type { TextBlock } from "@/lib/types";
import {
  type Detector,
  type DetectorResult,
  boxesOf,
  byY,
  collapse,
  countMatches,
  finding,
  pageText,
  plural,
  quote,
  status,
  words,
} from "./util";

const FIRST_PERSON_RE = /\b(I|I'm|I've|I'd|I'll|my|me|mine)\b/;
const FOUNDER_RE =
  /\b(founder|co-?founder|i built|i started|i made|i created|why i|why we (built|started|made)|my name is|hi,? i'?m|i'?m [A-Z][a-z]+,|i spent|i ran|i worked)\b/i;
const QUOTE_START_RE = /^\s*["“‘'«]/;
/** "Marcus Bell, owner of Spoke & Chain" style attribution. */
const FULL_ATTRIBUTION_RE =
  /^[—–-]?\s*[A-Z][\p{L}'’-]+\s+[A-Z][\p{L}'’-]{2,}.*?(,|·|\||\bat\b|\bof\b|@|—|–)\s*\S+/u;

function attributionFor(blocks: TextBlock[], i: number): TextBlock | null {
  const next = blocks[i + 1];
  if (!next) return null;
  if (QUOTE_START_RE.test(next.text) || /^h[1-6]$/i.test(next.tag)) return null;
  return words(next.text).length <= 16 ? next : null;
}

export const detectVoice: Detector = (capture) => {
  const out: DetectorResult = { findings: [], statuses: [] };
  const text = pageText(capture);
  const wc = words(text).length;
  const blocks = byY(
    capture.mobile.blocks.length
      ? capture.mobile.blocks
      : capture.desktop.blocks,
  );

  // Testimonials: blockquotes or quoted blocks, and the line that attributes them.
  const testimonials: {
    quote: TextBlock;
    by: TextBlock | null;
    named: boolean;
  }[] = [];
  blocks.forEach((b, i) => {
    const isQuote =
      b.tag.toLowerCase() === "blockquote" ||
      (QUOTE_START_RE.test(b.text) && words(b.text).length >= 5);
    if (!isQuote) return;
    const by = attributionFor(blocks, i);
    const inline = collapse(b.text).match(/[”"]\s*[—–-]\s*(.+)$/)?.[1];
    const line = inline ?? by?.text ?? "";
    testimonials.push({
      quote: b,
      by,
      named: FULL_ATTRIBUTION_RE.test(collapse(line)),
    });
  });

  // First person, excluding testimonial quotes (customers saying "I" isn't the founder).
  const quoted = new Set(testimonials.map((t) => t.quote));
  const ownText = blocks
    .filter((b) => !quoted.has(b))
    .map((b) => b.text)
    .join("\n");
  const firstPerson = countMatches(
    ownText || text,
    new RegExp(FIRST_PERSON_RE.source, "g"),
  );
  const founder = blocks.find((b) => !quoted.has(b) && FOUNDER_RE.test(b.text));

  out.statuses.push(
    status(
      founder
        ? `Found a founder voice: "${quote(founder.text, 60)}"`
        : firstPerson
          ? `${plural(firstPerson, "first-person word")}, but no founder in sight`
          : 'Nobody on this page says "I". It was written by a committee, or nobody.',
      founder?.box,
    ),
  );

  if (!founder) {
    out.findings.push(
      finding({
        id: "no-founder",
        tenet: "voice",
        severity: "medium",
        title: "No person behind the product",
        detail:
          "No founder, no name, no reason this exists; people trust people, not logos.",
        weight: 0.5,
      }),
    );
  }

  if (wc >= 150 && firstPerson === 0) {
    out.findings.push(
      finding({
        id: "no-first-person",
        tenet: "voice",
        severity: "low",
        title: "Never speaks in the first person",
        detail:
          'The whole page is written from nowhere; one honest "I" does more than ten "we empower"s.',
        weight: 0.3,
      }),
    );
  }

  if (testimonials.length) {
    const anon = testimonials.filter((t) => !t.named);
    out.statuses.push(
      status(
        `${plural(testimonials.length, "testimonial")}, ${anon.length ? `${anon.length} without a full name` : "all with names and context"}`,
        testimonials[0]!.quote.box,
      ),
    );
    if (anon.length && anon.length / testimonials.length >= 0.5) {
      out.findings.push(
        finding({
          id: "anonymous-testimonials",
          tenet: "voice",
          severity: anon.length >= 3 ? "high" : "medium",
          title: `${plural(anon.length, "testimonial")} from nobody in particular`,
          detail:
            "Initials or a job title without a company read as invented; a full name and context are what make a quote count.",
          evidence: anon.map(
            (t) =>
              `${quote(t.quote.text, 90)}${t.by ? ` ${quote(t.by.text, 40)}` : ""}`,
          ),
          boxes: boxesOf(
            anon.flatMap((t) => (t.by ? [t.quote, t.by] : [t.quote])),
          ),
          weight: 0.4,
        }),
      );
    }
  }

  return out;
};
