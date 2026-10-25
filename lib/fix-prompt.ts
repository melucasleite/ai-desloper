// Builds the prompt a founder pastes into their own AI coding tool to fix the
// page. Pure and deterministic: no model call, no I/O, safe on the client.

import { GENERIC_LEXICON } from "@/lib/analyze/detectors/specificity";
import { DOCTRINE } from "@/lib/doctrine";
import { QUESTIONS } from "@/lib/generate/questions";
import { TENETS, tenetTitle } from "@/lib/tenets";
import type {
  Finding,
  InterviewAnswers,
  InterviewKey,
  Report,
  Severity,
  TenetId,
} from "@/lib/types";

export type FixPromptReport = Pick<
  Report,
  | "url"
  | "title"
  | "metrics"
  | "findings"
  | "uniqueness"
  | "productFacts"
  | "fiveSecond"
  | "score"
>;

export interface FixPromptInput {
  report: FixPromptReport;
  /** Findings to fix. Anything not listed is left out of the prompt. */
  selectedFindingIds: Iterable<string>;
  answers?: InterviewAnswers;
}

/** Share of today's mobile length the fixed page may use. */
export const MOBILE_LENGTH_RATIO = 0.6;

/** The first phone screen the hard constraints are measured against. */
export const FIRST_VIEWPORT = { width: 390, height: 844 } as const;

/**
 * Mobile length target in screens: at most 60% of today's, rounded down to
 * one decimal, never below one screen. Null when the length wasn't measured.
 */
export function mobileLengthTarget(mobileScreens: number): number | null {
  if (!Number.isFinite(mobileScreens) || mobileScreens <= 0) return null;
  const tenths = Math.floor(mobileScreens * MOBILE_LENGTH_RATIO * 10 + 1e-9);
  return Math.max(1, tenths / 10);
}

/** The markers tenet isn't one of the eight principles; it gets its own line. */
export const MARKERS_PRINCIPLE = {
  title: "Write like a person, not a template",
  principle:
    "Emoji in headings, emoji bullets, rows of checkmarks and a steady drip of em dashes are the fingerprints of generated copy. Readers notice them before they read a word. Say the thing plainly and let the content carry the page.",
  checks: [
    "No emoji anywhere in the copy, headings or buttons.",
    "Em dashes replaced with commas, periods or parentheses.",
    "Lists use plain bullets or numbers, not checkmark or emoji glyphs.",
  ],
};

/** How each answer is used, in the order the prompt presents them. */
const ANSWER_ROLES: { key: InterviewKey; use: string }[] = [
  {
    key: "pain",
    use: "Source for the headline. Keep their wording as close as you can.",
  },
  {
    key: "customer",
    use: "The one reader the page is written for. Cut anything aimed at someone else.",
  },
  {
    key: "action",
    use: "The primary action. Phrase the button as what the visitor gets.",
  },
  {
    key: "story",
    use: "Source for a short founder note, in the first person. Paraphrase lightly; do not embellish.",
  },
  {
    key: "place",
    use: "Texture and proof a real person is behind it. Use it in the founder note or the footer.",
  },
  {
    key: "culture",
    use: "Sets mood and rhythm. Let it shape tone and word choice; do not name-drop.",
  },
  {
    key: "games",
    use: "Taste reference for layout metaphors (maps, inventories, progress). Use lightly or not at all.",
  },
  {
    key: "hobbies",
    use: "Vocabulary and small concrete details. One or two touches, not a theme.",
  },
  {
    key: "hate",
    use: "Treat every item here as a hard rule: the new page must not do it.",
  },
];

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function clean(text: string | undefined): string {
  return (text ?? "").replace(/\r\n?/g, "\n").trim();
}

/** Prefix every line so multi-line text stays inside one Markdown quote. */
function quoteBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

function oneLine(text: string, max = 280): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function principleFor(tenet: TenetId | "markers") {
  if (tenet === "markers") return MARKERS_PRINCIPLE;
  return DOCTRINE.find((d) => d.id === tenet) ?? MARKERS_PRINCIPLE;
}

/** Selected findings grouped by tenet, in doctrine order, worst first. */
export function groupSelected(
  findings: Finding[],
  selected: ReadonlySet<string>,
): { tenet: TenetId | "markers"; findings: Finding[] }[] {
  const chosen = findings.filter((f) => selected.has(f.id));
  return TENETS.map((t) => ({
    tenet: t.id,
    findings: chosen
      .filter((f) => f.tenet === t.id)
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
  })).filter((g) => g.findings.length > 0);
}

/** Answers that were actually filled in, in the order the prompt uses them. */
export function filledAnswers(
  answers: InterviewAnswers | undefined,
): { key: InterviewKey; question: string; use: string; answer: string }[] {
  if (!answers) return [];
  return ANSWER_ROLES.flatMap(({ key, use }) => {
    const answer = clean(answers[key]);
    if (!answer) return [];
    const question = QUESTIONS.find((q) => q.key === key)?.question ?? key;
    return [{ key, question, use, answer }];
  });
}

export function buildFixPrompt({
  report,
  selectedFindingIds,
  answers,
}: FixPromptInput): string {
  const selected = new Set(selectedFindingIds);
  const groups = groupSelected(report.findings, selected);
  const fixCount = groups.reduce((n, g) => n + g.findings.length, 0);
  const given = filledAnswers(answers);
  const title = oneLine(report.title || report.url, 160);
  const m = report.metrics;
  const target = mobileLengthTarget(m.mobileScreens);
  const action = clean(answers?.action);
  const out: string[] = [];

  out.push(
    `# Fix the landing page at ${report.url}`,
    "",
    `You are editing an existing landing page in this codebase: "${title}" (${report.url}). An automated review scored it ${Math.round(report.score.total)} out of 100 for generic, template-like patterns, grade ${report.score.grade} (0 is specific and hand-made, 100 is indistinguishable from a template). Fix the specific problems listed below. Do not rebuild the site from scratch.`,
    "",
    "## Ground rules",
    "",
    "- Keep the existing stack: the same framework, styling approach, components and build setup. Edit the files that render this page. Do not add a framework, a UI kit or a new dependency to do it.",
    "- Keep every product fact listed below. Do not invent customers, numbers, quotes, testimonials, logos, awards, prices or features.",
    "- When a fix needs a fact you do not have (a real customer name, a metric, a contact address), leave a clearly marked `TODO(owner):` in the copy instead of making one up.",
    "- Change what the instructions ask for and what that change requires. Leave unrelated pages, routes and logic alone.",
    "",
  );

  out.push("## Where the page stands today", "");
  const stands = [
    m.mobileScreens > 0 &&
      `${m.mobileScreens.toFixed(1)} screens tall on a 390px phone.`,
    `Headline in the first phone screen: ${m.headlineInFirstViewport ? "yes" : "no"}. Primary action in the first phone screen: ${m.ctaInFirstViewport ? "yes" : "no"}.`,
    `${m.distinctCtaLabels} different button and link labels competing for the click.`,
    (m.emojiCount > 0 || m.emDashCount > 0) &&
      `${m.emojiCount} emoji and ${m.emDashCount} em dashes in the copy.`,
    m.lcp !== null &&
      `Largest contentful paint ${Math.round(m.lcp)}ms, layout shift ${m.cls.toFixed(2)}.`,
  ].filter((line): line is string => Boolean(line));
  out.push(...stands.map((s) => `- ${s}`), "");

  if (report.fiveSecond) {
    const t = report.fiveSecond;
    out.push(
      "A first-time visitor shown only the first phone screen for five seconds said:",
      "",
      `- What is it? ${oneLine(t.whatIsIt) || "No idea."}`,
      `- Who is it for? ${oneLine(t.whoIsItFor) || "No idea."}`,
      `- What do I do next? ${oneLine(t.whatDoIDoNext) || "No idea."}`,
      "",
      t.matchesPage
        ? "That matches what the page is about. Keep the first screen at least this clear."
        : `That does not match the page. ${oneLine(t.note, 400)}`,
      "",
    );
  }

  if (report.productFacts.length > 0) {
    out.push("## Product facts to keep", "");
    for (const fact of report.productFacts) out.push(`- ${oneLine(fact)}`);
    out.push("");
  }

  if (report.uniqueness.length > 0) {
    out.push(
      "## Already distinctive: keep these",
      "",
      "These are the parts nobody else could have written. Keep them, and move them higher if they are buried.",
      "",
    );
    for (const u of report.uniqueness) {
      out.push(`- **${oneLine(u.title, 120)}**: "${oneLine(u.evidence)}"`);
    }
    out.push("");
  }

  if (given.length > 0) {
    out.push(
      "## The owner, in their own words",
      "",
      "These answers are the source for the story, the headline wording and the voice. Use their words over yours. Do not add details they did not give.",
      "",
    );
    for (const a of given) {
      out.push(
        `### ${a.question}`,
        "",
        quoteBlock(a.answer),
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
      : "No specific findings were selected. Apply the hard constraints below and leave the rest of the page as it is.",
    "",
  );

  let n = 0;
  for (const g of groups) {
    const p = principleFor(g.tenet);
    out.push(
      `### ${tenetTitle(g.tenet)}`,
      "",
      `Principle: **${p.title}.** ${p.principle}`,
      "",
    );
    for (const f of g.findings) {
      n += 1;
      out.push(`${n}. **${oneLine(f.title, 160)}** (${f.severity})`);
      out.push(`   ${oneLine(f.detail, 500)}`);
      const evidence = f.evidence.map((e) => oneLine(e, 220)).filter(Boolean);
      if (evidence.length > 0) {
        out.push("   On the page now:");
        for (const e of evidence.slice(0, 4)) out.push(`   - "${e}"`);
      }
    }
    out.push("", "Done when:", ...p.checks.map((c) => `- ${c}`), "");
  }

  const lexicon = GENERIC_LEXICON.map((l) => l.term).join(", ");
  const constraints = [
    `On a ${FIRST_VIEWPORT.width}px-wide phone, the headline and the primary call to action both sit inside the first screen (the top ${FIRST_VIEWPORT.width}x${FIRST_VIEWPORT.height}px) without scrolling.`,
    action
      ? `There is one primary action: "${oneLine(action, 160)}". Phrase its button as what the visitor gets, and repeat that same label at the natural decision points instead of inventing new ones.`
      : "There is one primary action, phrased as what the visitor gets. Repeat that same label at the natural decision points instead of inventing new ones. Three or fewer distinct action labels on the whole page.",
    "Every image, video and embedded media element has explicit width and height attributes or a CSS aspect-ratio, so nothing moves while it loads.",
    "A secondary contact path (a real email address, a short form or a phone number) is reachable from the page and styled as secondary to the primary action. If no real address exists in the codebase, use a `TODO(owner):` placeholder.",
    target !== null
      ? `On mobile, the whole page is at most ${target.toFixed(1)} screens tall (it is ${m.mobileScreens.toFixed(1)} today; that is ${Math.round(MOBILE_LENGTH_RATIO * 100)}% of the current length). Get there by cutting and merging sections, not by shrinking type or spacing.`
      : "On mobile, keep the page short: every section has to earn its scroll. Cut and merge rather than shrinking type or spacing.",
    "No emoji anywhere in the copy, headings or buttons.",
    `None of this generic lexicon, in any form: ${lexicon}.`,
  ];
  out.push(
    "## Hard constraints",
    "",
    "These apply to the whole page, whether or not a finding mentions them.",
    "",
    ...constraints.map((c, i) => `${i + 1}. ${c}`),
    "",
    "## When you are done",
    "",
    "- List the files you changed.",
    "- For each numbered fix above, one line on what you changed, or why you left it.",
    "- List every `TODO(owner):` you left, so the owner can fill in the real facts.",
    "",
  );

  return out.join("\n");
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "page"
  );
}

/** File name for the downloaded prompt, e.g. "example-com-fix-prompt.md". */
export function fixPromptFilename(url: string): string {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep the raw string */
  }
  return `${slug(host)}-fix-prompt.md`;
}
