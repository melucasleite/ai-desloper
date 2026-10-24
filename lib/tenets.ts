import type { TenetId } from "@/lib/types";

export const TENETS: {
  id: TenetId | "markers";
  title: string;
  short: string;
}[] = [
  { id: "pain", title: "Pain Above the Fold", short: "Pain" },
  { id: "show", title: "Show, Don't Decorate", short: "Show" },
  { id: "action", title: "One Clear Action", short: "Action" },
  { id: "specificity", title: "Specificity & Proof", short: "Specificity" },
  { id: "voice", title: "Human Voice & Story", short: "Voice" },
  { id: "economy", title: "Economy", short: "Economy" },
  { id: "identity", title: "Identity & Craft", short: "Identity" },
  { id: "speed", title: "Speed & Stability", short: "Speed" },
  { id: "markers", title: "AI Markers", short: "Markers" },
];

/** Share of the total score each tenet carries. Sums to 1. */
export const TENET_WEIGHTS: Record<TenetId, number> = {
  pain: 0.2,
  show: 0.12,
  action: 0.14,
  specificity: 0.16,
  voice: 0.1,
  economy: 0.1,
  identity: 0.1,
  speed: 0.08,
};

export function tenetTitle(id: TenetId | "markers"): string {
  return TENETS.find((t) => t.id === id)?.title ?? id;
}
