import { TENET_WEIGHTS } from "@/lib/tenets";
import type {
  Finding,
  Score,
  Severity,
  TenetId,
  TenetScore,
} from "@/lib/types";

/** Every knob of the Slop Score in one place. */
export const SCORE_CONFIG = {
  /** Per-tenet blend when the judge has a score for that tenet. */
  blend: { detector: 0.6, judge: 0.4 },
  tenetWeights: TENET_WEIGHTS,
  /** How hard each severity hits, multiplied by the finding's own weight. */
  severity: { low: 0.4, medium: 0.7, high: 1 } satisfies Record<
    Severity,
    number
  >,
  /** Ceiling of the cross-cutting AI Markers penalty, in points. */
  markersMaxPenalty: 15,
  /** Upper bound (exclusive) of each grade; anything above D is F. */
  grades: [
    [20, "A"],
    [35, "B"],
    [50, "C"],
    [65, "D"],
  ] as const,
} as const;

const TENET_IDS = Object.keys(TENET_WEIGHTS) as TenetId[];

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

/**
 * Combine findings as independent probabilities of "this is slop":
 * each one closes part of the remaining gap, so the result stays in 0..100
 * and a pile of small issues can't outweigh a page that's simply broken.
 */
function combine(findings: Finding[]): number {
  let clean = 1;
  for (const f of findings)
    clean *= 1 - clamp(f.weight, 0, 1) * SCORE_CONFIG.severity[f.severity];
  return (1 - clean) * 100;
}

function grade(total: number): Score["grade"] {
  for (const [max, g] of SCORE_CONFIG.grades) if (total < max) return g;
  return "F";
}

export function scoreReport(
  findings: Finding[],
  judge?: Partial<Record<TenetId, number>> | null,
  /** Which tenets count and how much; a README uses a subset. */
  weights: Partial<Record<TenetId, number>> = SCORE_CONFIG.tenetWeights,
): Score {
  const tenetIds = TENET_IDS.filter((t) => weights[t] != null);
  const detectorFindings = findings.filter((f) => f.source === "detector");

  const tenets: TenetScore[] = tenetIds.map((tenet) => {
    const detector = Math.round(
      combine(detectorFindings.filter((f) => f.tenet === tenet)),
    );
    const raw = judge?.[tenet];
    const j =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.round(clamp(raw))
        : null;
    const slop =
      j == null
        ? detector
        : Math.round(
            detector * SCORE_CONFIG.blend.detector +
              j * SCORE_CONFIG.blend.judge,
          );
    return { tenet, slop, detector, judge: j };
  });

  const weightSum = tenetIds.reduce((s, t) => s + (weights[t] ?? 0), 0) || 1;
  const base =
    tenets.reduce((s, t) => s + t.slop * (weights[t.tenet] ?? 0), 0) /
    weightSum;

  const markers = findings.filter((f) => f.tenet === "markers");
  const markersPenalty =
    Math.round((combine(markers) / 100) * SCORE_CONFIG.markersMaxPenalty * 10) /
    10;

  const total = Math.round(clamp(base + markersPenalty));
  return { total, grade: grade(total), tenets, markersPenalty };
}
