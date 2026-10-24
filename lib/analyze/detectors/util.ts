import type {
  Box,
  Capture,
  Finding,
  ViewportCapture,
  TextBlock,
} from "@/lib/types";

export interface DetectorStatus {
  message: string;
  box?: Box;
  screenshot?: "desktop" | "mobile";
}

export interface DetectorResult {
  findings: Finding[];
  statuses: DetectorStatus[];
}

export type Detector = (capture: Capture) => DetectorResult;

type FindingInput = Omit<Finding, "source" | "evidence" | "boxes"> & {
  evidence?: string[];
  boxes?: Box[];
};

export function finding(f: FindingInput): Finding {
  return {
    ...f,
    evidence: (f.evidence ?? []).filter(Boolean).slice(0, 6),
    boxes: (f.boxes ?? []).slice(0, 8),
    weight: Math.max(0, Math.min(1, f.weight)),
    source: "detector",
  };
}

export function status(message: string, box?: Box): DetectorStatus {
  return box ? { message, box, screenshot: box.viewport } : { message };
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function quote(text: string, max = 140): string {
  const t = collapse(text);
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function fmt(n: number, digits = 1): string {
  return Number(n.toFixed(digits)).toString();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** First family of a CSS font-family list, unquoted. */
export function familyName(fontFamily: string): string {
  return (fontFamily.split(",")[0] ?? "").replace(/["']/g, "").trim();
}

/** Lists like "A, B, and C". */
export function humanList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function inFirstViewport(box: Box, vp: ViewportCapture): boolean {
  return box.y + Math.min(box.height, 40) <= vp.height;
}

export function screensDown(box: Box, vp: ViewportCapture): number {
  return vp.height > 0 ? box.y / vp.height : 0;
}

export function byY<T extends { box: Box }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

export function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => collapse(line).split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return (text.match(new RegExp(re.source, flags)) ?? []).length;
}

/** Blocks whose text matches, deepest first so we highlight the tightest box. */
export function blocksMatching(blocks: TextBlock[], re: RegExp): TextBlock[] {
  const test = new RegExp(re.source, re.flags.replace("g", ""));
  return blocks.filter((b) => test.test(b.text));
}

export function boxesOf(items: { box: Box }[], max = 8): Box[] {
  return items.slice(0, max).map((i) => i.box);
}

export const EMOJI_RE = /\p{Extended_Pictographic}/gu;
/** Pictographic code points that are really typography. */
const NOT_EMOJI = new Set(["©", "®", "™", "↔", "↕"]);

export function normalizeLabel(text: string): string {
  return collapse(
    text
      .replace(EMOJI_RE, "")
      .replace(/[←-⇿➔➡⬅-⬇→←›»>]/g, "")
      .replace(/[^\p{L}\p{N}' ]/gu, " ")
      .toLowerCase(),
  );
}

// ── Shared page landmarks ──────────────────────────────────────────────

const NAV_LABEL_RE =
  /^(log ?in|sign ?in|menu|close|open menu|skip to content|toggle (menu|navigation)|account|cart|search)$/i;

export function findHeadline(vp: ViewportCapture): TextBlock | null {
  const visible = vp.blocks.filter((b) => collapse(b.text).length > 0);
  const h1 = byY(visible.filter((b) => b.tag.toLowerCase() === "h1"))[0];
  if (h1) return h1;
  const top = visible.filter(
    (b) => b.box.y < vp.height * 1.5 && b.text.trim().length > 3,
  );
  return (
    [...top].sort((a, b) => b.fontSize - a.fontSize || a.box.y - b.box.y)[0] ??
    null
  );
}

export function findSubhead(
  vp: ViewportCapture,
  headline: TextBlock | null,
): TextBlock | null {
  if (!headline) return null;
  return (
    byY(vp.blocks).find(
      (b) =>
        b.box.y > headline.box.y &&
        b !== headline &&
        b.fontSize <= headline.fontSize &&
        words(b.text).length >= 6,
    ) ?? null
  );
}

export type PageLink = ViewportCapture["links"][number];

export function ctaButtons(vp: ViewportCapture): PageLink[] {
  return byY(
    vp.links.filter((l) => {
      const label = normalizeLabel(l.text);
      return l.isButton && label.length > 0 && !NAV_LABEL_RE.test(label);
    }),
  );
}

export function findPrimaryCta(vp: ViewportCapture): PageLink | null {
  return ctaButtons(vp)[0] ?? null;
}

export function distinctCtaLabels(capture: Capture): Map<string, PageLink[]> {
  const labels = new Map<string, PageLink[]>();
  for (const vp of [capture.desktop, capture.mobile]) {
    for (const l of ctaButtons(vp)) {
      const key = normalizeLabel(l.text);
      const list = labels.get(key) ?? [];
      if (
        !list.some(
          (x) => x.box.viewport === l.box.viewport && x.box.y === l.box.y,
        )
      )
        list.push(l);
      labels.set(key, list);
    }
  }
  return labels;
}

export function pageText(capture: Capture): string {
  if (capture.visibleText?.trim()) return capture.visibleText;
  return capture.mobile.blocks.map((b) => b.text).join("\n");
}

export function emojiList(text: string): string[] {
  return (text.match(EMOJI_RE) ?? []).filter((c) => !NOT_EMOJI.has(c));
}
