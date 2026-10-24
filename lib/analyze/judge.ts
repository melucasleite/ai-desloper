import { generateText, Output } from "ai";
import { z } from "zod";
import { MODELS, hasGateway } from "@/lib/ai";
import { doctrinePrompt } from "@/lib/doctrine";
import type {
  Box,
  Capture,
  FiveSecondTest,
  Finding,
  Severity,
  TenetId,
  TextBlock,
  UniquenessSignal,
} from "@/lib/types";

export interface JudgeResult {
  tenetScores: Partial<Record<TenetId, number>>;
  findings: Finding[];
  uniqueness: UniquenessSignal[];
  fiveSecond: FiveSecondTest | null;
  productFacts: string[];
}

const TENET_IDS = [
  "pain",
  "show",
  "action",
  "specificity",
  "voice",
  "economy",
  "identity",
  "speed",
] as const satisfies readonly TenetId[];

/** Tenets where a finding can be purely visual, with nothing to quote. */
const VISUAL_TENETS = new Set<Finding["tenet"]>([
  "show",
  "identity",
  "speed",
  // Sparkle icons, checkmark grids and glows are tics with nothing to quote.
  "markers",
]);

/** A quote must be at least this long (normalized) and this many words to count. */
const MIN_QUOTE_CHARS = 12;
const MIN_QUOTE_WORDS = 3;

const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 0.3,
  medium: 0.55,
  high: 0.85,
};

const MAX_TEXT_CHARS = 12_000;
const CALL_TIMEOUT_MS = 90_000;

// ---------- schemas ----------

const tenetScoreSchema = z.object({
  slop: z.number().describe("0 = exemplary, 100 = pure template slop"),
  reason: z.string().describe("One sentence on why"),
});

const judgeSchema = z.object({
  tenetScores: z.object(
    Object.fromEntries(TENET_IDS.map((id) => [id, tenetScoreSchema])) as Record<
      TenetId,
      typeof tenetScoreSchema
    >,
  ),
  findings: z
    .array(
      z.object({
        tenet: z.enum([...TENET_IDS, "markers"]),
        severity: z.enum(["low", "medium", "high"]),
        title: z.string().describe("Short, specific, under 70 characters"),
        detail: z
          .string()
          .describe("One plain sentence: why this hurts the page"),
        evidence: z
          .array(z.string())
          .describe(
            "Exact snippets copied verbatim from the page text. Empty only for purely visual issues.",
          ),
      }),
    )
    .describe("4 to 10 issues the automated checks missed"),
  uniqueness: z
    .array(
      z.object({
        title: z.string().describe("What is genuinely theirs, in a few words"),
        evidence: z
          .string()
          .describe(
            'A verbatim quote in double quotes, or a description of the visual starting with "Visual:"',
          ),
      }),
    )
    .describe("0 to 6 things worth keeping in a rewrite"),
  productFacts: z
    .array(z.string())
    .describe(
      "Concrete facts: product name, what it does, pricing, plans, features, integrations, numbers, customers, team, location",
    ),
});

const blindSchema = z.object({
  whatIsIt: z.string(),
  whoIsItFor: z.string(),
  whatDoIDoNext: z.string(),
});

const compareSchema = z.object({
  matchesPage: z.boolean(),
  note: z
    .string()
    .describe("One sentence on the gap between first impression and reality"),
});

// ---------- context building ----------

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  // Keep the head (hero + early sections) and a tail slice (closing CTA, footer).
  const head = Math.floor(max * 0.8);
  return `${text.slice(0, head)}\n[...]\n${text.slice(-(max - head))}`;
}

function headings(capture: Capture): TextBlock[] {
  return capture.mobile.blocks.filter(
    (b) => /^h[1-4]$/i.test(b.tag) && b.text.trim(),
  );
}

function firstViewportText(capture: Capture): string {
  const { blocks, height } = capture.mobile;
  return blocks
    .filter((b) => b.box.y < height && b.text.trim())
    .map((b) => `<${b.tag}> ${b.text.trim()}`)
    .join("\n");
}

function ctaLabels(capture: Capture): string[] {
  const labels = capture.mobile.links
    .filter((l) => l.isButton && l.text.trim())
    .map((l) => l.text.trim());
  return [...new Set(labels)].slice(0, 20);
}

function buildContext(capture: Capture, detectorFindings: Finding[]): string {
  const heads = headings(capture)
    .slice(0, 40)
    .map(
      (b) =>
        `${"  ".repeat(Number(b.tag[1]) - 1)}${b.tag.toLowerCase()}: ${b.text.trim()}`,
    )
    .join("\n");
  const detected = detectorFindings
    .map((f) => `- [${f.tenet}/${f.severity}] ${f.title}`)
    .join("\n");

  return [
    `URL: ${capture.finalUrl || capture.url}`,
    `Title: ${capture.title}`,
    `Mobile page height: ${(capture.mobile.fullHeight / capture.mobile.height).toFixed(1)} screens at ${capture.mobile.width}px`,
    `CLS: ${capture.cls.toFixed(3)}; LCP: ${capture.lcp == null ? "n/a" : `${Math.round(capture.lcp)}ms`}`,
    `Fonts: ${capture.fonts.slice(0, 8).join(", ") || "unknown"}`,
    `Colors: ${capture.colors.slice(0, 12).join(", ") || "unknown"}`,
    `Backgrounds: ${capture.backgrounds.slice(0, 8).join(", ") || "unknown"}`,
    `Buttons / CTAs: ${ctaLabels(capture).join(" | ") || "none found"}`,
    "",
    "## First mobile viewport (390px) text",
    firstViewportText(capture) || "(nothing readable)",
    "",
    "## Headline structure",
    heads || "(no headings)",
    "",
    "## Already flagged by automated checks (do not repeat these)",
    detected || "(none)",
    "",
    "## Visible page text",
    truncate(capture.visibleText, MAX_TEXT_CHARS),
  ].join("\n");
}

const JUDGE_SYSTEM = `You are a blunt, exacting landing-page critic. You judge pages against this doctrine:

${"{{DOCTRINE}}"}

Scoring: for each tenet give a slop score from 0 (exemplary, unmistakably this product) to 100 (interchangeable template copy). Most AI-generated pages land between 55 and 90. Be calibrated, not cruel.

Findings: add only issues the automated checks missed. Every quote in "evidence" must be copied character-for-character from the page text provided; never paraphrase inside evidence. Prefer specific, fixable issues over general complaints. Use tenet "markers" for verbal or visual AI tics; a verbal tic needs a verbatim quote, a visual one (sparkle icons, checkmark grids, glows) may have empty evidence.

Uniqueness: name what is already genuinely theirs (a real number, a named customer, an opinionated line, a distinctive visual). These will be preserved in the rewrite. If nothing qualifies, return an empty list.

Product facts: extract concrete, reusable facts only. No adjectives, no marketing claims without substance. Never invent facts.`;

const BLIND_SYSTEM = `You see one phone-sized screenshot of the first screen of a landing page and nothing else. You have five seconds. Answer plainly, in under 20 words each, using only what is visible. If the screen doesn't make it clear, say so honestly ("Unclear: some kind of AI tool").`;

// ---------- calls ----------

function imagePart(base64: string) {
  return { type: "file" as const, mediaType: "image/png", data: base64 };
}

async function runJudge(
  capture: Capture,
  detectorFindings: Finding[],
  signal?: AbortSignal,
) {
  const { output } = await generateText({
    model: MODELS.judge,
    system: JUDGE_SYSTEM.replace("{{DOCTRINE}}", doctrinePrompt()),
    output: Output.object({ schema: judgeSchema, name: "page_judgement" }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildContext(capture, detectorFindings) },
          { type: "text", text: "The first mobile viewport, as rendered:" },
          imagePart(capture.mobile.firstViewport),
        ],
      },
    ],
    maxRetries: 1,
    timeout: CALL_TIMEOUT_MS,
    abortSignal: signal,
  });
  return output;
}

async function runFiveSecond(
  capture: Capture,
  signal?: AbortSignal,
): Promise<FiveSecondTest> {
  const { output: blind } = await generateText({
    model: MODELS.judge,
    system: BLIND_SYSTEM,
    output: Output.object({ schema: blindSchema, name: "five_second_test" }),
    messages: [
      {
        role: "user",
        content: [
          imagePart(capture.mobile.firstViewport),
          {
            type: "text",
            text: "What is this? Who is it for? What do I do next?",
          },
        ],
      },
    ],
    maxRetries: 1,
    timeout: CALL_TIMEOUT_MS,
    abortSignal: signal,
  });

  const heads = headings(capture)
    .slice(0, 20)
    .map((b) => b.text.trim())
    .join("\n");
  const { output: verdict } = await generateText({
    model: MODELS.judge,
    system:
      "Compare a visitor's five-second first impression of a landing page against what the full page actually offers. matchesPage is true only if all three answers are substantially right.",
    output: Output.object({
      schema: compareSchema,
      name: "five_second_verdict",
    }),
    prompt: [
      "First impression (from the first screen only):",
      `- What is it: ${blind.whatIsIt}`,
      `- Who is it for: ${blind.whoIsItFor}`,
      `- What do I do next: ${blind.whatDoIDoNext}`,
      "",
      `The full page (title: ${capture.title}). Headings:`,
      heads,
      "",
      "Text:",
      truncate(capture.visibleText, 4000),
    ].join("\n"),
    maxRetries: 1,
    timeout: CALL_TIMEOUT_MS,
    abortSignal: signal,
  });

  return { ...blind, ...verdict };
}

// ---------- post-processing ----------

function boxesFor(quotes: string[], capture: Capture): Box[] {
  const boxes: Box[] = [];
  for (const quote of quotes) {
    const q = normalize(quote);
    for (const vp of [capture.mobile, capture.desktop]) {
      const hit = vp.blocks.find((b) => normalize(b.text).includes(q));
      if (hit) boxes.push(hit.box);
    }
  }
  return boxes.slice(0, 4);
}

/**
 * True only for a meaningful quote that really appears on the page. Trivial
 * snippets ("the", "AI", ".") match almost any page and prove nothing.
 */
export function isVerifiedQuote(quote: string, pageText: string): boolean {
  const q = normalize(quote).replace(/^["'\s]+|["'\s]+$/g, "");
  if (q.length < MIN_QUOTE_CHARS) return false;
  if (
    q.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length < MIN_QUOTE_WORDS
  )
    return false;
  return pageText.includes(q);
}

/** Spans in double quotes inside a free-text evidence string. */
function quotedSpans(text: string): string[] {
  return [...text.matchAll(/["“”]([^"“”]{4,})["“”]/g)].map((m) => m[1]!);
}

/**
 * Keeps a uniqueness signal only if its evidence (or a quoted span inside it)
 * verifies against the page, or it is a visual description with nothing quoted.
 */
export function verifyUniqueness(
  raw: { title: string; evidence: string }[],
  capture: Capture,
): UniquenessSignal[] {
  const pageText = normalize(`${capture.title}\n${capture.visibleText}`);
  const out: UniquenessSignal[] = [];
  for (const u of raw) {
    const title = u.title.trim();
    const evidence = u.evidence.trim();
    if (!title || !evidence) continue;
    const spans = quotedSpans(evidence);
    const ok =
      spans.length > 0
        ? spans.some((s) => isVerifiedQuote(s, pageText))
        : isVerifiedQuote(evidence, pageText) ||
          // A description of a visual: nothing quoted, and it isn't claiming
          // to be page text, so there is nothing to verify against.
          /^(visual|image|photo|illustration|layout|design|color|colour|typography|logo)\b/i.test(
            evidence,
          );
    if (ok) out.push({ title, evidence });
    if (out.length >= 6) break;
  }
  return out;
}

function verifyFindings(
  raw: z.infer<typeof judgeSchema>["findings"],
  capture: Capture,
): Finding[] {
  const pageText = normalize(`${capture.title}\n${capture.visibleText}`);
  const out: Finding[] = [];

  for (const f of raw) {
    const quotes = f.evidence.map((e) => e.trim()).filter(Boolean);
    const verified = quotes.filter((q) => isVerifiedQuote(q, pageText));
    // Without a meaningful verified quote, only purely visual findings survive:
    // invented or trivially short quotes are treated as hallucinations.
    if (verified.length === 0 && !VISUAL_TENETS.has(f.tenet)) continue;
    // A visual finding that quotes text which isn't there is still invented.
    if (
      verified.length === 0 &&
      quotes.some((q) => normalize(q).length >= MIN_QUOTE_CHARS)
    )
      continue;

    out.push({
      id: `judge-${out.length + 1}`,
      tenet: f.tenet,
      severity: f.severity,
      title: f.title.trim(),
      detail: f.detail.trim(),
      evidence: verified.slice(0, 4),
      boxes: boxesFor(verified, capture),
      weight: SEVERITY_WEIGHT[f.severity],
      source: "judge",
    });
  }
  return out.slice(0, 12);
}

function dedupe(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.replace(/\s+/g, " ").trim();
    const key = normalize(item);
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** Detector-only fallback: product facts from the title, headings and number-bearing lines. */
export function heuristicFacts(capture: Capture): string[] {
  const heads = headings(capture).map((b) => b.text);
  const numeric = capture.visibleText
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8 && s.length < 160 && /(\$|€|£|\d)/.test(s));
  return dedupe([capture.title, ...heads, ...numeric], 14);
}

// ---------- entry point ----------

export async function judgePage(
  capture: Capture,
  detectorFindings: Finding[],
  signal?: AbortSignal,
  options: { fiveSecond?: boolean } = {},
): Promise<JudgeResult> {
  const fallback: JudgeResult = {
    tenetScores: {},
    findings: [],
    uniqueness: [],
    fiveSecond: null,
    productFacts: heuristicFacts(capture),
  };
  if (!hasGateway() || !capture.mobile.firstViewport) return fallback;

  const [judged, fiveSecond] = await Promise.allSettled([
    runJudge(capture, detectorFindings, signal),
    options.fiveSecond === false
      ? Promise.resolve(null)
      : runFiveSecond(capture, signal),
  ]);

  if (judged.status === "rejected")
    console.error("[judge] main call failed:", judged.reason);
  if (fiveSecond.status === "rejected")
    console.error("[judge] five-second test failed:", fiveSecond.reason);

  const result: JudgeResult = {
    ...fallback,
    fiveSecond:
      fiveSecond.status === "fulfilled" ? (fiveSecond.value ?? null) : null,
  };
  if (judged.status !== "fulfilled" || !judged.value) return result;

  const j = judged.value;
  for (const id of TENET_IDS) {
    const s = j.tenetScores[id];
    if (s) result.tenetScores[id] = Math.round(clamp(s.slop));
  }
  result.findings = verifyFindings(j.findings, capture);
  result.uniqueness = verifyUniqueness(j.uniqueness, capture);
  const facts = dedupe(j.productFacts, 20);
  if (facts.length) result.productFacts = facts;
  return result;
}
