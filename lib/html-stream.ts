// Client-side helpers for the /api/generate text protocol and for rendering
// partially streamed HTML. Pure functions, no DOM access.
//
// Protocol:
//   <html chunks…>
//   [<!--DESLOP-REPLACE--><full replacement html…>]   (optional, repeatable)
//   <!--DESLOP:{"score":Score}-->                      (trailing, once)
import type { Score } from "@/lib/types";

export const REPLACE_MARKER = "<!--DESLOP-REPLACE-->";
export const META_PREFIX = "<!--DESLOP:";
const META_SUFFIX = "-->";

export interface ParsedStream {
  /** Visible HTML so far (after the last replace marker, without protocol comments). */
  html: string;
  /** Present once the trailing meta comment has fully arrived. */
  score: Score | null;
  metaComplete: boolean;
  /** True when the server replaced the first draft with a revision. */
  replaced: boolean;
  /** Set when the server reported that generation itself failed. */
  error: string | null;
}

/** Length of the longest suffix of `text` that is a prefix of one of `markers`. */
function partialMarkerLength(text: string, markers: string[]): number {
  let best = 0;
  for (const marker of markers) {
    const max = Math.min(marker.length - 1, text.length);
    for (let len = max; len > best; len--) {
      if (text.endsWith(marker.slice(0, len))) {
        best = len;
        break;
      }
    }
  }
  return best;
}

export function parseGenerateStream(raw: string): ParsedStream {
  let body = raw;
  let score: Score | null = null;
  let metaComplete = false;
  let error: string | null = null;

  const metaAt = body.indexOf(META_PREFIX);
  if (metaAt !== -1) {
    const end = body.indexOf(META_SUFFIX, metaAt + META_PREFIX.length);
    if (end !== -1) {
      metaComplete = true;
      try {
        const meta = JSON.parse(
          body.slice(metaAt + META_PREFIX.length, end),
        ) as {
          score?: Score | null;
          error?: string;
        };
        score = meta.score ?? null;
        error = typeof meta.error === "string" ? meta.error : null;
      } catch {
        score = null;
      }
    }
    body = body.slice(0, metaAt);
  }

  const replaceAt = body.lastIndexOf(REPLACE_MARKER);
  const replaced = replaceAt !== -1;
  if (replaced) body = body.slice(replaceAt + REPLACE_MARKER.length);

  // Hide a protocol marker that is only half way through arriving.
  if (!metaComplete) {
    const partial = partialMarkerLength(body, [REPLACE_MARKER, META_PREFIX]);
    if (partial) body = body.slice(0, body.length - partial);
  }

  return {
    html: stripCodeFence(body),
    score,
    metaComplete,
    replaced,
    error,
  };
}

/** Models sometimes wrap output in ```html fences; drop them. */
function stripCodeFence(html: string): string {
  return html.replace(/^\s*```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
}

const BLOCK_CLOSE_RE = /<\/(section|header|footer|main)\s*>/gi;
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

export type BlockCounts = Record<
  "section" | "header" | "footer" | "main",
  number
>;

export function emptyCounts(): BlockCounts {
  return { section: 0, header: 0, footer: 0, main: 0 };
}

/** Count closed top-level-ish blocks, used to animate only newly arrived ones. */
export function countClosedBlocks(html: string): BlockCounts {
  const counts = emptyCounts();
  for (const m of html.matchAll(BLOCK_CLOSE_RE)) {
    counts[m[1].toLowerCase() as keyof BlockCounts]++;
  }
  return counts;
}

/** Close any elements left open at the end of `html`, innermost first. */
export function autoClose(html: string): string {
  const stack: string[] = [];
  const tagRe = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    if (!m[2]) continue; // comment
    const [, closing, rawName, selfClosing] = m;
    const name = rawName.toLowerCase();
    if (closing) {
      const idx = stack.lastIndexOf(name);
      if (idx !== -1) stack.length = idx;
      continue;
    }
    if (VOID_TAGS.has(name) || selfClosing) continue;
    if (RAW_TEXT_TAGS.has(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, tagRe.lastIndex);
      if (close === -1) {
        stack.push(name);
        break;
      }
      tagRe.lastIndex = close;
      continue;
    }
    stack.push(name);
  }
  return (
    html +
    stack
      .reverse()
      .map((t) => `</${t}>`)
      .join("")
  );
}

/**
 * Cut streamed HTML back to the last fully closed section/header/footer/main
 * so blocks appear whole, then close whatever is still open. Returns null when
 * no block has closed yet.
 */
export function renderableStreamHtml(html: string): string | null {
  let lastEnd = -1;
  for (const m of html.matchAll(BLOCK_CLOSE_RE)) {
    lastEnd = (m.index ?? 0) + m[0].length;
  }
  if (lastEnd === -1) return null;
  return autoClose(html.slice(0, lastEnd));
}

/** A style block that fades in blocks beyond the counts already shown. */
export function streamFadeStyle(previous: BlockCounts): string {
  const rules = (Object.keys(previous) as (keyof BlockCounts)[])
    .map((tag) => `${tag}:nth-of-type(n+${previous[tag] + 1})`)
    .join(",");
  return `<style data-deslop-stream>@media (prefers-reduced-motion: no-preference){@keyframes deslop-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}:is(${rules}){animation:deslop-in .7s cubic-bezier(.2,.8,.2,1) both}}</style>`;
}

/** Insert markup right before </head>, or at the top of the document. */
export function injectIntoHead(html: string, markup: string): string {
  const headClose = html.search(/<\/head\s*>/i);
  if (headClose !== -1)
    return html.slice(0, headClose) + markup + html.slice(headClose);
  const bodyOpen = html.search(/<body\b[^>]*>/i);
  if (bodyOpen !== -1)
    return html.slice(0, bodyOpen) + markup + html.slice(bodyOpen);
  return markup + html;
}

const SECTION_HINTS: [RegExp, string][] = [
  [/hero|intro|above/i, "your hero"],
  [/pric|plan/i, "pricing"],
  [/faq|question/i, "the questions"],
  [/founder|story|about|why/i, "the founder note"],
  [/proof|testimon|customer|case|quote/i, "the proof"],
  [/how|work|step|mechan/i, "how it works"],
  [/demo|product|feature|show/i, "the product section"],
  [/contact|talk|email/i, "the contact path"],
  [/cta|start|signup|join/i, "the call to action"],
];

function decodeText(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Human status line from the stream: what the model is writing right now. */
export function describeStreamProgress(html: string): string {
  if (!html.trim()) return "Reading your answers…";
  if (!/<body\b/i.test(html)) {
    return /<style\b/i.test(html)
      ? "Setting type and color…"
      : "Laying the foundations…";
  }

  const opens = [
    ...html.matchAll(/<(header|section|footer|main|h1|h2)\b([^>]*)>/gi),
  ];
  const last = opens.at(-1);
  if (!last) return "Starting the page…";

  const tag = last[1].toLowerCase();
  const attrs = last[2] ?? "";
  if (tag === "h1" || tag === "h2") {
    const after = html.slice((last.index ?? 0) + last[0].length);
    const text = decodeText(after.split(/<\/h[12]/i)[0]).slice(0, 48);
    if (text.length > 3)
      return `Writing “${text}${text.length >= 48 ? "…" : ""}”`;
  }
  if (tag === "footer") return "Signing off with the footer…";
  if (tag === "header") return "Writing your hero…";

  const label =
    attrs.match(/(?:id|class|aria-label)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
  for (const [re, name] of SECTION_HINTS) {
    if (re.test(label)) return `Writing ${name}…`;
  }
  const sectionsSoFar = (html.match(/<section\b/gi) ?? []).length;
  return sectionsSoFar <= 1
    ? "Writing your hero…"
    : `Writing section ${sectionsSoFar}…`;
}
