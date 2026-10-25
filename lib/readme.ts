// The README reading of the doctrine: which principles apply to a README, what
// they ask of one, the checks only a Markdown source can answer, and the
// prompt that fixes it. Landing-page checks about folds, buttons, fonts and
// paint times don't apply to a file rendered by a code host, so they are off.

import { marked } from "marked";
import { finding, quote } from "@/lib/analyze/detectors/util";
import { GENERIC_LEXICON } from "@/lib/analyze/detectors/specificity";
import { groupSelected, MARKERS_PRINCIPLE } from "@/lib/fix-prompt";
import { tenetTitle } from "@/lib/tenets";
import type {
  Finding,
  InterviewAnswers,
  InterviewKey,
  Metrics,
  Score,
  TenetId,
  UniquenessSignal,
} from "@/lib/types";

/** Share of a README's score each principle carries. Sums to 1. */
export const README_TENET_WEIGHTS: Partial<Record<TenetId, number>> = {
  pain: 0.25,
  specificity: 0.2,
  show: 0.15,
  action: 0.15,
  economy: 0.15,
  voice: 0.1,
};

/** Landing-page detector findings that mean the same thing in a README. */
export const README_DETECTOR_IDS = new Set([
  "category-headline",
  "headline-too-long",
  "subhead-rambles",
  "generic-lexicon",
  "not-x-but-y",
  "triplets",
  "vague-copy",
  "anonymous-testimonials",
  "duplicate-sections",
  "checkmark-lists",
  "em-dash-rate",
  "emoji-bullets",
  "emoji-density",
  "emoji-headings",
]);

export const README_DOCTRINE: {
  id: TenetId;
  title: string;
  principle: string;
  checks: string[];
}[] = [
  {
    id: "pain",
    title: "Say what it is and why in the first two lines",
    principle:
      "Someone lands on the repo from a search or a link and decides in seconds. The first sentence under the name says what the project does and for whom, in plain words, before any badge wall, logo banner or table of contents. The problem it solves beats the category it belongs to: nobody needs a blazing-fast framework, they need their build to stop taking four minutes.",
    checks: [
      "The first sentence under the title says what the project does, in under 30 words.",
      "It names the problem or the outcome, not the category.",
      "Nothing but the title and a few badges comes before it.",
    ],
  },
  {
    id: "show",
    title: "Show it working",
    principle:
      "A README earns trust by showing the thing run: a command and its real output, a short code sample, a screenshot of the actual interface. A paragraph of adjectives about how powerful it is shows nothing.",
    checks: [
      "There is at least one real example near the top: a code block, its output, or a screenshot of the real thing.",
      "Examples are copied from real use and actually run.",
    ],
  },
  {
    id: "action",
    title: "One path from zero to working",
    principle:
      "A reader who wants to try it needs one way in: install, run, see it work. Three alternative package managers, a Docker option and a cloud button before the first working command is a maze, not a choice.",
    checks: [
      "One install and first-run sequence a reader can copy and paste.",
      "Alternatives come after the main path, not before it.",
      "Prerequisites are stated, with versions where they matter.",
    ],
  },
  {
    id: "specificity",
    title: "Specificity is the whole game",
    principle:
      "Real numbers, real limits, real trade-offs. Say what it does not do. A README that is seamless, powerful and lightning-fast describes every project and so describes none.",
    checks: [
      "Claims carry a number, a comparison or an example.",
      "Known limits or non-goals are written down.",
      "No generic marketing vocabulary.",
    ],
  },
  {
    id: "voice",
    title: "A person wrote this",
    principle:
      "The best READMEs sound like the person who built it explaining it to a colleague: why it exists, what they were frustrated by, what they decided not to do. Template prose with a heading for every possible section sounds like nobody.",
    checks: [
      "Some sentence says why the project exists, in a human voice.",
      "No anonymous praise or invented quotes.",
    ],
  },
  {
    id: "economy",
    title: "Every section earns its place",
    principle:
      "A short project needs a short README. Features lists that restate the intro, empty Roadmap and Support headings, a table of contents for six sections and a Star History chart are padding. Cut what a reader wouldn't miss.",
    checks: [
      "No section restates another.",
      "No boilerplate headings with nothing specific under them.",
      "No table of contents unless the file is long enough to need one.",
    ],
  },
];

/** Markdown block of the README principles, for judging. */
export function readmeDoctrinePrompt(): string {
  return [...README_DOCTRINE, { id: "markers", ...MARKERS_PRINCIPLE }]
    .map((d, i) =>
      [
        `### ${i + 1}. ${d.title} (tenet: ${d.id})`,
        d.principle,
        "Checks:",
        ...d.checks.map((c) => `- ${c}`),
      ].join("\n"),
    )
    .join("\n\n");
}

const README_CSS = `
body { margin: 0; background: #fff; color: #1f2328; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }
main { max-width: 880px; margin: 0 auto; padding: 32px 16px; }
h1, h2 { border-bottom: 1px solid #d1d9e0; padding-bottom: .3em; }
pre { background: #f6f8fa; padding: 16px; overflow: auto; border-radius: 6px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 85%; }
img { max-width: 100%; }
table { border-collapse: collapse; } td, th { border: 1px solid #d1d9e0; padding: 6px 13px; }
`;

/**
 * Renders Markdown the way a code host shows it, with each heading's content
 * wrapped in a <section> so the section-level detectors can see the structure.
 */
export function renderReadme(markdown: string, title: string): string {
  const body = marked.parse(markdown, { async: false, gfm: true });
  const sectioned = body
    .split(/(?=<h[12][\s>])/)
    .map((part) => `<section>${part}</section>`)
    .join("\n");
  const safeTitle = title.replace(/[<&]/g, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title><style>${README_CSS}</style></head><body><main>${sectioned}</main></body></html>`;
}

/** The first H1 of the Markdown, or the file name. */
export function readmeTitle(markdown: string, fallback: string): string {
  const h1 = markdown.match(/^#\s+(.+)$/m)?.[1];
  return h1 ? h1.replace(/[*_`[\]]/g, "").trim() : fallback;
}

const BADGE_RE =
  /!\[[^\]]*\]\([^)]*(shields\.io|badge|badgen|travis-ci|codecov|circleci|actions\/workflows)[^)]*\)/gi;
const QUICKSTART_RE =
  /^#{1,4}\s.*\b(install|installation|setup|set up|getting started|get started|quick ?start|usage|run it|running)\b/im;
const BOILERPLATE_RE =
  /^#{2,3}\s*(?:\p{Extended_Pictographic}\s*)*(table of contents|contents|features|key features|why .+\?|roadmap|contributing|acknowledg(e)?ments|star history|support|show your support|license|authors|faq)\s*$/gimu;

/** Checks that only the Markdown source can answer. */
export function detectReadme(markdown: string): Finding[] {
  const out: Finding[] = [];
  const fences = markdown.match(/^```/gm)?.length ?? 0;
  const indented = /^(?: {4}|\t)\S/m.test(markdown);
  const images = (markdown.match(/!\[[^\]]*\]\([^)]+\)|<img\s/gi) ?? []).length;
  const badges = markdown.match(BADGE_RE) ?? [];

  if (fences < 2 && !indented && images - badges.length <= 0) {
    out.push(
      finding({
        id: "readme-no-example",
        tenet: "show",
        severity: "high",
        title: "Nothing shows it working",
        detail:
          "There is no code block, output or screenshot, so a reader has to take the description on faith.",
        weight: 0.8,
      }),
    );
  }

  if (!QUICKSTART_RE.test(markdown) && fences < 2) {
    out.push(
      finding({
        id: "readme-no-quickstart",
        tenet: "action",
        severity: "high",
        title: "No way to install or run it",
        detail:
          "A reader who wants to try it can't find an install step or a first command to copy.",
        weight: 0.8,
      }),
    );
  }

  if (badges.length >= 6) {
    out.push(
      finding({
        id: "readme-badge-wall",
        tenet: "economy",
        severity: badges.length >= 10 ? "medium" : "low",
        title: `${badges.length} badges before anything is said`,
        detail:
          "A wall of badges pushes the description down and tells a newcomer nothing about what the project does.",
        evidence: badges.slice(0, 2).map((b) => quote(b, 100)),
        weight: 0.5,
      }),
    );
  }

  const boilerplate = [...markdown.matchAll(BOILERPLATE_RE)].map((m) =>
    m[0].replace(/^#+\s*/, "").trim(),
  );
  if (boilerplate.length >= 5) {
    out.push(
      finding({
        id: "readme-boilerplate-outline",
        tenet: "economy",
        severity: "medium",
        title: `${boilerplate.length} template section headings`,
        detail:
          "The outline follows the generic README template rather than what this project needs a reader to know.",
        evidence: [boilerplate.join(", ")],
        weight: 0.6,
      }),
    );
  }

  return out;
}

/** Answers a README can use, and how. */
const README_ANSWER_ROLES: {
  key: InterviewKey;
  question: string;
  use: string;
}[] = [
  {
    key: "pain",
    question: "What problem does it solve, in a user's words?",
    use: "Source for the first sentence. Keep their wording as close as you can.",
  },
  {
    key: "customer",
    question: "Who is it for?",
    use: "The one reader the README is written for. Cut anything aimed at someone else.",
  },
  {
    key: "story",
    question: "Why did you build it?",
    use: "Source for one or two sentences on why it exists, in the first person. Do not embellish.",
  },
  {
    key: "hate",
    question: "What should the README never do?",
    use: "Treat every item here as a hard rule.",
  },
];

export interface ReadmeFixPromptInput {
  path: string;
  title: string;
  metrics: Metrics;
  findings: Finding[];
  uniqueness: UniquenessSignal[];
  productFacts: string[];
  score: Score;
  selectedFindingIds: Iterable<string>;
  answers?: InterviewAnswers;
}

function oneLine(text: string, max = 280): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** The README counterpart of buildFixPrompt. Pure and deterministic. */
export function buildReadmeFixPrompt(input: ReadmeFixPromptInput): string {
  const groups = groupSelected(
    input.findings,
    new Set(input.selectedFindingIds),
  );
  const fixCount = groups.reduce((n, g) => n + g.findings.length, 0);
  const m = input.metrics;
  const out: string[] = [
    `# Fix the README at ${input.path}`,
    "",
    `You are editing "${oneLine(input.title, 160)}" (${input.path}) in this repository. An automated review scored it ${Math.round(input.score.total)} out of 100 for generic, template-like writing, grade ${input.score.grade} (0 is specific and hand-written, 100 is indistinguishable from a template). Fix the specific problems listed below. Edit the file in place; do not start over.`,
    "",
    "## Ground rules",
    "",
    "- Keep every fact, command, flag, version and link that is correct today. Check commands against the code before changing them.",
    "- Do not invent benchmarks, users, quotes, features or roadmap items.",
    "- When a fix needs a fact you do not have, leave a clearly marked `TODO(owner):` instead of making one up.",
    "- Keep the Markdown portable: no HTML layout tricks that only one code host renders.",
    "",
    "## Where it stands today",
    "",
    `- ${m.wordCount} words.`,
    `- ${m.emojiCount} emoji and ${m.emDashCount} em dashes.`,
    "",
  ];

  if (input.productFacts.length > 0) {
    out.push("## Facts to keep", "");
    for (const fact of input.productFacts) out.push(`- ${oneLine(fact)}`);
    out.push("");
  }

  if (input.uniqueness.length > 0) {
    out.push(
      "## Already distinctive: keep these",
      "",
      ...input.uniqueness.map(
        (u) => `- **${oneLine(u.title, 120)}**: ${oneLine(u.evidence)}`,
      ),
      "",
    );
  }

  const given = README_ANSWER_ROLES.flatMap((r) => {
    const answer = (input.answers?.[r.key] ?? "").trim();
    return answer ? [{ ...r, answer }] : [];
  });
  if (given.length > 0) {
    out.push("## The owner, in their own words", "");
    for (const a of given) {
      out.push(
        `### ${a.question}`,
        "",
        ...a.answer.split("\n").map((l) => (l.trim() ? `> ${l}` : ">")),
        "",
        `Use: ${a.use}`,
        "",
      );
    }
  }

  out.push(
    `## Fix these (${fixCount})`,
    "",
    fixCount > 0
      ? "Grouped by the principle each one breaks. For every group, the problems come first, then what done looks like."
      : "No specific findings were selected. Apply the hard constraints below and leave the rest as it is.",
    "",
  );
  let n = 0;
  for (const g of groups) {
    const p =
      README_DOCTRINE.find((d) => d.id === g.tenet) ?? MARKERS_PRINCIPLE;
    out.push(
      `### ${g.tenet === "markers" ? tenetTitle("markers") : p.title}`,
      "",
      `Principle: ${p.principle}`,
      "",
    );
    for (const f of g.findings) {
      n += 1;
      out.push(`${n}. **${oneLine(f.title, 160)}** (${f.severity})`);
      out.push(`   ${oneLine(f.detail, 500)}`);
      const evidence = f.evidence.map((e) => oneLine(e, 220)).filter(Boolean);
      if (evidence.length > 0) {
        out.push("   In the file now:");
        for (const e of evidence.slice(0, 4)) out.push(`   - "${e}"`);
      }
    }
    out.push("", "Done when:", ...p.checks.map((c) => `- ${c}`), "");
  }

  const lexicon = GENERIC_LEXICON.map((l) => l.term).join(", ");
  const constraints = [
    "The first sentence under the title says what the project does and for whom, before any table of contents.",
    "There is one copy-paste path from install to a first working result, near the top.",
    "At least one real example: a command with its output, a code sample, or a screenshot of the real thing.",
    "No emoji in headings or bullets, and no checkmark lists.",
    "Em dashes replaced with commas, periods or parentheses.",
    `None of this generic lexicon, in any form: ${lexicon}.`,
  ];
  out.push(
    "## Hard constraints",
    "",
    ...constraints.map((c, i) => `${i + 1}. ${c}`),
    "",
    "## When you are done",
    "",
    "- For each numbered fix above, one line on what you changed, or why you left it.",
    "- List every `TODO(owner):` you left, so the owner can fill in the real facts.",
    "",
  );
  return out.join("\n");
}
