import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/types";
import { handmadeCapture } from "./__fixtures__/handmade";
import { sloppyCapture } from "./__fixtures__/sloppy";
import { runDetectors } from "./detectors";

const sloppy = runDetectors(sloppyCapture);
const handmade = runDetectors(handmadeCapture);
const ids = (f: Finding[]) => new Set(f.map((x) => x.id));

describe("detectors", () => {
  it.each([
    "cta-below-fold",
    "high-cls",
    "generic-cta-label",
    "emoji-headings",
    "emoji-density",
    "generic-lexicon",
  ])("%s fires on the sloppy page only", (id) => {
    expect(ids(sloppy.findings)).toContain(id);
    expect(ids(handmade.findings)).not.toContain(id);
  });

  it.each([
    "category-headline",
    "no-product-visual",
    "unsized-media",
    "competing-ctas",
    "no-contact-path",
    "not-x-but-y",
    "no-founder",
    "anonymous-testimonials",
    "too-long-mobile",
    "duplicate-sections",
    "template-sequence",
    "default-fonts",
    "purple-gradient",
    "glassmorphism",
    "everything-centered",
    "slow-lcp",
    "checkmark-lists",
  ])("%s fires on the sloppy page only", (id) => {
    expect(ids(sloppy.findings)).toContain(id);
    expect(ids(handmade.findings)).not.toContain(id);
  });

  it("every finding quotes evidence or explains itself, and boxes match a viewport", () => {
    for (const f of [...sloppy.findings, ...handmade.findings]) {
      expect(f.detail.length).toBeGreaterThan(20);
      expect(f.weight).toBeGreaterThan(0);
      expect(f.weight).toBeLessThanOrEqual(1);
      for (const b of f.boxes)
        expect(["desktop", "mobile"]).toContain(b.viewport);
    }
    const cta = sloppy.findings.find((f) => f.id === "generic-cta-label")!;
    expect(cta.evidence).toContain("Get Started");
    expect(cta.boxes.length).toBeGreaterThan(0);
  });

  it("computes metrics", () => {
    expect(sloppy.metrics.mobileScreens).toBeGreaterThan(12);
    expect(sloppy.metrics.cls).toBe(0.31);
    expect(sloppy.metrics.ctaInFirstViewport).toBe(false);
    expect(sloppy.metrics.headlineInFirstViewport).toBe(true);
    expect(sloppy.metrics.emojiCount).toBeGreaterThan(15);
    expect(sloppy.metrics.distinctCtaLabels).toBeGreaterThan(3);
    expect(handmade.metrics.ctaInFirstViewport).toBe(true);
    expect(handmade.metrics.emojiCount).toBe(0);
    expect(handmade.metrics.mobileScreens).toBeLessThan(6);
  });

  it("emits status lines with real numbers", () => {
    const msgs = sloppy.statuses.map((s) => s.message);
    expect(
      msgs.some((m) => /^Page is [\d.]+ screens tall on mobile$/.test(m)),
    ).toBe(true);
    expect(
      msgs.some((m) => /^Found \d+ emoji, \d+ of them rockets$/.test(m)),
    ).toBe(true);
    expect(msgs).toContain("Fonts: Inter, Inter, and Inter");
    expect(msgs).toContain("Layout shifted 0.31 while loading");
    expect(msgs.some((m) => /CTA is [\d.]+ screens down/.test(m))).toBe(true);
    expect(
      sloppy.statuses.some((s) => s.box && s.screenshot === s.box.viewport),
    ).toBe(true);
  });
});
