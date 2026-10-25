import { describe, expect, it } from "vitest";
import { scoreReport } from "@/lib/analyze/score";
import {
  buildReadmeFixPrompt,
  detectReadme,
  README_TENET_WEIGHTS,
  readmeTitle,
  renderReadme,
} from "@/lib/readme";
import type { Metrics } from "@/lib/types";

const SLOPPY = `# 🚀 FlowKit

${Array.from({ length: 6 }, (_, i) => `[![b${i}](https://img.shields.io/badge/b-${i}-blue)](x)`).join(" ")}

The next-generation toolkit to supercharge your workflow.

## Table of Contents
## Features
## Why FlowKit?
## Roadmap
## Contributing
## License
`;

const HANDMADE = `# tidy

Renames photos by the date they were taken, so a folder of IMG_4031.jpg sorts by day.

## Install

\`\`\`bash
npm i -g tidy-photos
\`\`\`

## Use

\`\`\`bash
tidy ~/Pictures/2024
\`\`\`
`;

const METRICS: Metrics = {
  mobileScreens: 2,
  cls: 0,
  lcp: null,
  emojiCount: 1,
  emDashCount: 0,
  wordCount: 40,
  distinctCtaLabels: 0,
  headlineInFirstViewport: true,
  ctaInFirstViewport: false,
};

describe("README checks", () => {
  it("flags a README with no example, no install path, badges and a template outline", () => {
    const ids = detectReadme(SLOPPY).map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "readme-no-example",
        "readme-no-quickstart",
        "readme-badge-wall",
        "readme-boilerplate-outline",
      ]),
    );
  });

  it("leaves a short, concrete README alone", () => {
    expect(detectReadme(HANDMADE)).toEqual([]);
  });

  it("wraps each heading in a section and keeps the title", () => {
    const html = renderReadme(HANDMADE, readmeTitle(HANDMADE, "README.md"));
    expect(html).toContain("<title>tidy</title>");
    expect(html.match(/<section>/g)?.length).toBe(3);
  });
});

describe("README score and prompt", () => {
  it("only counts the README principles", () => {
    const score = scoreReport(detectReadme(SLOPPY), null, README_TENET_WEIGHTS);
    expect(score.tenets.map((t) => t.tenet).sort()).toEqual(
      Object.keys(README_TENET_WEIGHTS).sort(),
    );
    expect(score.total).toBeGreaterThan(30);
  });

  it("builds the same prompt for the same input, with only selected findings", () => {
    const findings = detectReadme(SLOPPY);
    const input = {
      path: "README.md",
      title: "FlowKit",
      metrics: METRICS,
      findings,
      uniqueness: [],
      productFacts: ["Published on npm as flowkit"],
      score: scoreReport(findings, null, README_TENET_WEIGHTS),
      selectedFindingIds: ["readme-no-example"],
      answers: { pain: "My builds take four minutes." },
    };
    const prompt = buildReadmeFixPrompt(input);
    expect(prompt).toBe(buildReadmeFixPrompt(input));
    expect(prompt).toContain("# Fix the README at README.md");
    expect(prompt).toContain("Nothing shows it working");
    expect(prompt).not.toContain("No way to install or run it");
    expect(prompt).toContain("> My builds take four minutes.");
    expect(prompt).toContain("Published on npm as flowkit");
  });
});
