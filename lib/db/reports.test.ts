import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Capture, Score, Theme } from "@/lib/types";
import {
  claimReport,
  getLatestGeneration,
  getReport,
  getSnapshot,
  listReportsForUser,
  saveGeneration,
  saveInterview,
  saveReport,
  saveThemes,
} from "./reports";

// Runs against memory by default. Point it at a local stack to exercise
// Supabase too:  NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
//                SUPABASE_SECRET_KEY=… yarn vitest lib/db
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const score = (total: number): Score => ({
  total,
  grade: total > 60 ? "F" : "B",
  tenets: [],
  markersPenalty: 0,
});

const theme: Theme = {
  name: "Field notes",
  premise: "A notebook from the workshop.",
  palette: [{ name: "Ink", hex: "#111111" }],
  typography: { display: "Fraunces", body: "Inter" },
  voice: "Plain",
  sampleHeadline: "Stop guessing",
  sectionMetaphors: [],
};

function capture(): Capture {
  const vp = (viewport: "desktop" | "mobile") => ({
    viewport,
    width: viewport === "desktop" ? 1440 : 390,
    height: 900,
    fullHeight: 3000,
    screenshot: PNG,
    firstViewport: PNG,
    blocks: [],
    links: [],
    images: [],
    sections: [],
  });
  return {
    url: "https://example.com",
    finalUrl: "https://example.com/",
    title: "Example",
    html: "<html></html>",
    snapshotHtml: "<html><body>frozen</body></html>",
    visibleText: "",
    fonts: [],
    colors: [],
    backgrounds: [],
    cls: 0,
    lcp: null,
    desktop: vp("desktop"),
    mobile: vp("mobile"),
  };
}

describe("reports persistence", () => {
  it("round-trips a report, generation and claim", async () => {
    const saved = await saveReport({
      capture: capture(),
      report: {
        url: "https://example.com",
        title: "Example",
        metrics: {
          mobileScreens: 8,
          cls: 0,
          lcp: null,
          emojiCount: 0,
          emDashCount: 0,
          wordCount: 100,
          distinctCtaLabels: 3,
          headlineInFirstViewport: true,
          ctaInFirstViewport: false,
        },
        findings: [],
        uniqueness: [],
        fiveSecond: null,
        score: score(82),
        productFacts: ["fact"],
      },
    });

    expect(saved.claimToken).toBeTruthy();
    expect(saved.snapshotUrl).toBe(`/api/snapshot/${saved.id}`);
    expect(saved.screenshots.desktop).toBeTruthy();

    const loaded = await getReport(saved.id);
    expect(loaded?.score.total).toBe(82);
    expect(loaded?.claimToken).toBeUndefined();
    expect(await getSnapshot(saved.id)).toContain("frozen");
    expect(await getReport("not-a-uuid")).toBeNull();

    await saveInterview(saved.id, { story: "garage" });
    await saveThemes(saved.id, [theme, theme, theme], 1);
    await saveThemes(saved.id, [theme, theme, theme]);

    expect(await getLatestGeneration(saved.id)).toBeNull();
    await saveGeneration(saved.id, {
      html: "<p>one</p>",
      score: score(40),
      selectedFindingIds: [],
      theme,
    });
    await new Promise((r) => setTimeout(r, 15));
    await saveGeneration(saved.id, {
      html: "<p>two</p>",
      score: score(14),
      selectedFindingIds: ["a"],
      theme,
    });
    expect((await getLatestGeneration(saved.id))?.html).toBe("<p>two</p>");

    // Claim needs a real auth user in Supabase mode, so only check it in memory.
    if (!process.env.SUPABASE_SECRET_KEY) {
      const userId = randomUUID();
      expect(await claimReport(saved.id, "wrong", userId)).toBe(false);
      expect(await claimReport(saved.id, saved.claimToken!, userId)).toBe(true);
      expect(await claimReport(saved.id, saved.claimToken!, randomUUID())).toBe(
        false,
      );
      const list = await listReportsForUser(userId);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ score: 82, newScore: 14 });
    }
  });
});
