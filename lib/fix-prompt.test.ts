import { describe, expect, it } from "vitest";

import { DOCTRINE } from "@/lib/doctrine";
import {
  buildFixPrompt,
  filledAnswers,
  fixPromptFilename,
  mobileLengthTarget,
  type FixPromptReport,
} from "@/lib/fix-prompt";
import type { Finding } from "@/lib/types";

function finding(over: Partial<Finding> & Pick<Finding, "id">): Finding {
  return {
    tenet: "pain",
    severity: "high",
    title: `Title of ${over.id}`,
    detail: `Detail of ${over.id}.`,
    evidence: [],
    boxes: [],
    weight: 1,
    source: "detector",
    ...over,
  };
}

const findings: Finding[] = [
  finding({
    id: "cta-below-fold",
    title: "Primary action is below the first screen",
    evidence: ["Get started"],
  }),
  finding({
    id: "generic-lexicon",
    tenet: "specificity",
    severity: "medium",
    title: "7 generic marketing words",
    evidence: ["Unlock your team's full potential"],
  }),
  finding({
    id: "emoji-density",
    tenet: "markers",
    severity: "low",
    title: "20 emoji, 4 rockets, 2 sparkles",
    evidence: ["Ship faster 🚀"],
  }),
];

const report: FixPromptReport = {
  url: "https://example.com/",
  title: "Example: invoices that chase themselves",
  metrics: {
    mobileScreens: 12.7,
    cls: 0.02,
    lcp: 1800,
    emojiCount: 20,
    emDashCount: 6,
    wordCount: 900,
    distinctCtaLabels: 6,
    headlineInFirstViewport: true,
    ctaInFirstViewport: false,
  },
  findings,
  uniqueness: [
    { title: "A named founder", evidence: "I ran ops at a clinic in Porto." },
  ],
  productFacts: ["Sends invoice reminders by email", "Costs $12 a month"],
  fiveSecond: null,
  score: { total: 82, grade: "F", tenets: [], markersPenalty: 4 },
};

const ALL = findings.map((f) => f.id);

describe("mobileLengthTarget", () => {
  it("is 60% of the current length, rounded down to a tenth", () => {
    expect(mobileLengthTarget(12.7)).toBe(7.6);
    expect(mobileLengthTarget(10)).toBe(6);
    expect(mobileLengthTarget(5)).toBe(3);
  });

  it("never goes below one screen and is null when unmeasured", () => {
    expect(mobileLengthTarget(1.2)).toBe(1);
    expect(mobileLengthTarget(0)).toBeNull();
    expect(mobileLengthTarget(Number.NaN)).toBeNull();
  });
});

describe("buildFixPrompt", () => {
  it("includes every selected finding with its evidence and principle", () => {
    const prompt = buildFixPrompt({ report, selectedFindingIds: ALL });
    expect(prompt).toContain("## Fix these (3)");
    expect(prompt).toContain("Primary action is below the first screen");
    expect(prompt).toContain('"Get started"');
    expect(prompt).toContain('"Unlock your team\'s full potential"');
    const pain = DOCTRINE.find((d) => d.id === "pain")!;
    const specificity = DOCTRINE.find((d) => d.id === "specificity")!;
    expect(prompt).toContain(pain.title);
    expect(prompt).toContain(specificity.principle);
    expect(prompt).toContain("Write like a person, not a template");
  });

  it("leaves deselected findings out entirely", () => {
    const prompt = buildFixPrompt({
      report,
      selectedFindingIds: ["cta-below-fold"],
    });
    expect(prompt).toContain("## Fix these (1)");
    expect(prompt).toContain("Primary action is below the first screen");
    expect(prompt).not.toContain("7 generic marketing words");
    expect(prompt).not.toContain("Unlock your team's full potential");
    expect(prompt).not.toContain("20 emoji, 4 rockets");
    expect(prompt).not.toContain("Ship faster");
    const specificity = DOCTRINE.find((d) => d.id === "specificity")!;
    expect(prompt).not.toContain(specificity.principle);
  });

  it("still gives the hard constraints when nothing is selected", () => {
    const prompt = buildFixPrompt({ report, selectedFindingIds: [] });
    expect(prompt).toContain("## Fix these (0)");
    expect(prompt).toContain("No specific findings were selected");
    expect(prompt).toContain("## Hard constraints");
  });

  it("keeps the product facts, the uniqueness signals and the stack", () => {
    const prompt = buildFixPrompt({ report, selectedFindingIds: ALL });
    expect(prompt).toContain("https://example.com/");
    expect(prompt).toContain("Example: invoices that chase themselves");
    expect(prompt).toContain("- Sends invoice reminders by email");
    expect(prompt).toContain("- Costs $12 a month");
    expect(prompt).toContain("**A named founder**");
    expect(prompt).toContain("I ran ops at a clinic in Porto.");
    expect(prompt).toMatch(/Keep the existing stack/);
    expect(prompt).toMatch(/Do not invent/);
  });

  it("states the hard constraints with the computed mobile target", () => {
    const prompt = buildFixPrompt({ report, selectedFindingIds: ALL });
    expect(prompt).toContain("first screen (the top 390x844px)");
    expect(prompt).toMatch(/width and height attributes or a CSS aspect-ratio/);
    expect(prompt).toMatch(/secondary contact path/);
    expect(prompt).toContain("at most 7.6 screens tall (it is 12.7 today");
    expect(prompt).toContain("No emoji anywhere");
    expect(prompt).toMatch(/unlock, seamless, supercharge/);
  });

  it("weaves interview answers in when present", () => {
    const prompt = buildFixPrompt({
      report,
      selectedFindingIds: ALL,
      answers: {
        story: "I kept rebuilding the same spreadsheet every Monday.",
        pain: "  I spend Friday afternoons chasing invoices.  ",
        action: "See which invoices are late",
        hate: "The gradient.\nThe rocket emoji.",
        culture: "   ",
      },
    });
    expect(prompt).toContain("## The owner, in their own words");
    expect(prompt).toContain(
      "> I kept rebuilding the same spreadsheet every Monday.",
    );
    expect(prompt).toContain("> I spend Friday afternoons chasing invoices.");
    expect(prompt).toContain("> The gradient.\n> The rocket emoji.");
    expect(prompt).toContain(
      'one primary action: "See which invoices are late"',
    );
    expect(prompt).toContain("Source for the headline");
    // Blank answers are skipped, along with their question.
    expect(prompt).not.toContain("What music, films or books");
  });

  it("has no owner section when the answers are empty", () => {
    for (const answers of [undefined, {}, { story: "  ", pain: "" }]) {
      const prompt = buildFixPrompt({
        report,
        selectedFindingIds: ALL,
        answers,
      });
      expect(prompt).not.toContain("The owner, in their own words");
      expect(prompt).not.toContain("How did this start?");
    }
    expect(filledAnswers({ story: " " })).toEqual([]);
  });

  it("drops the owner section entirely once the interview is skipped", () => {
    const answered = buildFixPrompt({
      report,
      selectedFindingIds: ALL,
      answers: { story: "Started in a garage.", pain: "Late invoices." },
    });
    expect(answered).toContain("Started in a garage.");
    // Skipping clears every answer, so the prompt is built from findings only.
    const skipped = buildFixPrompt({
      report,
      selectedFindingIds: ALL,
      answers: {},
    });
    expect(skipped).not.toContain("The owner, in their own words");
    expect(skipped).not.toContain("Started in a garage.");
    expect(skipped).toBe(buildFixPrompt({ report, selectedFindingIds: ALL }));
  });

  it("is deterministic", () => {
    const input = { report, selectedFindingIds: ALL, answers: { pain: "x" } };
    expect(buildFixPrompt(input)).toBe(buildFixPrompt(input));
  });
});

describe("fixPromptFilename", () => {
  it("names the file after the host", () => {
    expect(fixPromptFilename("https://www.example.com/pricing")).toBe(
      "example-com-fix-prompt.md",
    );
  });
});
