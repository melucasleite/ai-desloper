import { describe, expect, it } from "vitest";
import { TENET_WEIGHTS } from "@/lib/tenets";
import { handmadeCapture } from "./__fixtures__/handmade";
import { sloppyCapture } from "./__fixtures__/sloppy";
import { runDetectors } from "./detectors";
import { SCORE_CONFIG, scoreReport } from "./score";

describe("scoreReport", () => {
  const sloppy = scoreReport(runDetectors(sloppyCapture).findings);
  const handmade = scoreReport(runDetectors(handmadeCapture).findings);

  it("scores the sloppy page high and the hand-made page low", () => {
    expect(sloppy.total).toBeGreaterThan(65);
    expect(sloppy.grade).toBe("F");
    expect(sloppy.markersPenalty).toBeGreaterThan(0);
    expect(handmade.total).toBeLessThan(35);
    expect(handmade.markersPenalty).toBe(0);
  });

  it("covers every tenet and uses detector-only scores without a judge", () => {
    expect(sloppy.tenets.map((t) => t.tenet).sort()).toEqual(
      Object.keys(TENET_WEIGHTS).sort(),
    );
    for (const t of sloppy.tenets) {
      expect(t.judge).toBeNull();
      expect(t.slop).toBe(t.detector);
    }
  });

  it("blends 60/40 with the judge per tenet", () => {
    const findings = runDetectors(handmadeCapture).findings;
    const blended = scoreReport(findings, { pain: 100 });
    const pain = blended.tenets.find((t) => t.tenet === "pain")!;
    expect(pain.judge).toBe(100);
    expect(pain.slop).toBe(
      Math.round(
        pain.detector * SCORE_CONFIG.blend.detector +
          100 * SCORE_CONFIG.blend.judge,
      ),
    );
    const voice = blended.tenets.find((t) => t.tenet === "voice")!;
    expect(voice.judge).toBeNull();
  });

  it("stays within 0..100", () => {
    const worst = scoreReport(
      runDetectors(sloppyCapture).findings,
      Object.fromEntries(Object.keys(TENET_WEIGHTS).map((k) => [k, 100])),
    );
    expect(worst.total).toBeLessThanOrEqual(100);
    expect(scoreReport([]).total).toBe(0);
    expect(scoreReport([]).grade).toBe("A");
  });

  it("tenet weights sum to 1", () => {
    expect(Object.values(TENET_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(
      1,
    );
  });
});
