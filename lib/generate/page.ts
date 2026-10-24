/**
 * Page generation stream.
 *
 * Wire protocol of POST /api/generate (text/html; charset=utf-8):
 *
 *   1. The generated page, streamed as it is written. It always starts with
 *      `<!doctype html>` and ends at `</html>`; markdown fences and chatter
 *      around the document are stripped server-side.
 *   2. Optionally, if the re-score is still over REVISION_THRESHOLD and a
 *      silent revision pass produced a better page:
 *        `<!--DESLOP-REPLACE-->` followed by the full revised document.
 *      The client must discard everything it rendered before the marker and
 *      use what follows instead.
 *   3. Always last, exactly once:
 *        `<!--DESLOP:{"score":Score|null,"generationId"?:string,"error"?:string}-->`
 *      `score` is null when re-scoring failed. `error` is set only when
 *      generation itself failed (in which case part 1 may be empty).
 *
 * Client parsing: split on the last `<!--DESLOP:`; if the text before it
 * contains `<!--DESLOP-REPLACE-->`, the page is what follows that marker.
 */
import { generateText, streamText } from "ai";

import { MODELS, hasGateway } from "@/lib/ai";
import { captureHtml } from "@/lib/analyze/capture";
import { runDetectors } from "@/lib/analyze/detectors";
import { judgePage } from "@/lib/analyze/judge";
import { scoreReport } from "@/lib/analyze/score";
import { saveGeneration } from "@/lib/db/reports";
import { doctrinePrompt } from "@/lib/doctrine";
import { tenetTitle } from "@/lib/tenets";
import type { Finding, GenerateRequest, Score } from "@/lib/types";

import { QUESTIONS } from "./questions";

export const REPLACE_MARKER = "<!--DESLOP-REPLACE-->";
export const SCORE_MARKER = "<!--DESLOP:";

/** Slop total above which one silent revision pass runs. */
const REVISION_THRESHOLD = 30;
/** Mobile viewport used by capture, for converting screens to pixels. */
const MOBILE_VIEWPORT_HEIGHT = 844;
/** Overall time budget, kept under the route's maxDuration (300s). */
const BUDGET_MS = 285_000;
/** Don't start a revision unless at least this much budget remains. */
const MIN_REVISION_MS = 150_000;
/** Budget kept back after a revision for re-scoring it (capture + judge). */
const RESCORE_RESERVE_MS = 70_000;

// --- prompt ----------------------------------------------------------------

function list(items: string[], empty: string): string {
  return items.length ? items.map((s) => `- ${s}`).join("\n") : `- ${empty}`;
}

function findingLine(f: Finding): string {
  const tenet = tenetTitle(f.tenet);
  const evidence = f.evidence
    .slice(0, 3)
    .map((e) => `"${e.slice(0, 160)}"`)
    .join("; ");
  return `[${tenet}] ${f.title}. ${f.detail}${evidence ? ` Seen on the old page: ${evidence}` : ""}`;
}

function mobileTarget(req: GenerateRequest): { screens: number; px: number } {
  const original = req.report.metrics.mobileScreens || 6;
  // 60% of the original, with a floor so a short original doesn't force a cramped page.
  const screens = Math.max(3, Math.round(original * 0.6 * 10) / 10);
  return { screens, px: Math.round(screens * MOBILE_VIEWPORT_HEIGHT) };
}

const HARD_CONSTRAINTS = (req: GenerateRequest) => {
  const target = mobileTarget(req);
  return `Hard constraints (all mandatory):
1. Output ONE complete, self-contained HTML document and nothing else. Start with <!doctype html>, end with </html>. No markdown fences, no commentary.
2. All CSS inline in a single <style> in <head>. Google Fonts via <link> is allowed (preconnect + display=swap); use font fallbacks with similar metrics (size-adjust or a close system stack) so swapping does not shift layout. No other external CSS or JS. No frameworks, no CDN scripts, no external images.
3. At a 390x${MOBILE_VIEWPORT_HEIGHT} viewport, the headline AND the primary CTA button are fully visible without scrolling (inside the first ${MOBILE_VIEWPORT_HEIGHT}px, ideally the first 700px).
4. Every media element (img, svg, video, iframe, canvas, picture) has explicit width and height attributes or a CSS aspect-ratio, so nothing shifts while loading.
5. Exactly one primary action, phrased as what the visitor gets, repeated at natural decision points with the same label. A secondary contact path (a real mailto: link or a short form) is always present and visibly styled as secondary.
6. Total height on mobile (390px wide) at most ${target.screens} screens (about ${target.px}px). Cut sections before shrinking type.
7. Illustrations are inline SVG that explain the mechanism (a diagram of the workflow, a before/after, a simplified UI of the product). No decorative blobs, abstract 3D shapes, gradient orbs, stock-photo placeholders or icon grids.
8. No emoji anywhere, no emoji-like symbols as bullets (no sparkles, rockets, checkmark lists). Use em dashes sparingly (at most two on the page).
9. No generic lexicon: unlock, seamless, supercharge, elevate, empower, game-changer, revolutionize, effortless, cutting-edge, next-level, "say goodbye to", "it's not X, it's Y", reflexive triplets of adjectives.
10. Semantic HTML: header, main, section with headings in order, footer; one h1; buttons are <a> or <button> with real text; images have meaningful alt text (or aria-hidden for purely structural SVG).
11. Readable and complete without JavaScript. If you add any script, it is tiny, inline, optional, and the page works without it.
12. Motion only where it explains, and wrapped in @media (prefers-reduced-motion: no-preference). Respect prefers-color-scheme only if the theme has a true dark variant; otherwise use the theme palette as-is.
13. Text contrast meets WCAG AA. Body text at least 16px on mobile. Tap targets at least 44px.
14. Do not invent customers, logos, testimonials, metrics or quotes. Use only the product facts and interview answers given. Where proof is missing, use the founder's own first-person words instead of fake social proof.
15. Never name or imitate other brands or companies.`;
};

function buildPrompt(req: GenerateRequest): string {
  const { report, answers, theme } = req;
  const selected = new Set(req.selectedFindingIds);
  const neverDo = report.findings.filter((f) => selected.has(f.id));

  // "hate" is promised to go straight into the never-do list, not the story.
  const hate = answers.hate?.trim();
  const interview = QUESTIONS.filter((q) => q.key !== "hate")
    .map((q) => {
      const value = answers[q.key]?.trim();
      return value ? `- ${q.question}\n  ${value.slice(0, 1500)}` : null;
    })
    .filter((x): x is string => Boolean(x));

  const palette = theme.palette.map((c) => `${c.name} ${c.hex}`).join(", ");

  return `Rewrite the landing page for: ${report.title} (${report.url})
The old page scored ${report.score.total}/100 on slop (higher is worse). It is ${report.metrics.mobileScreens} screens tall on mobile with ${report.metrics.distinctCtaLabels} distinct CTA labels.

PRODUCT FACTS (true; keep every one that matters, do not add new ones):
${list(report.productFacts, "(none extracted; rely on the interview)")}

ALREADY DISTINCTIVE (keep these, they are the founder's):
${list(
  report.uniqueness.map((u) => `${u.title}: ${u.evidence}`),
  "(nothing distinctive found)",
)}

NEVER DO (the founder chose to fix these problems from the old page, and named their own pet hates):
${list(
  [
    ...(hate ? [`[Founder, in their words] ${hate.slice(0, 600)}`] : []),
    ...neverDo.map(findingLine),
  ],
  "(no findings selected; still follow the doctrine)",
)}

INTERVIEW (the story source; use their words, their place, their references):
${interview.length ? interview.join("\n") : "- (skipped; write from the product facts in a plain first-person voice)"}
${answers.action?.trim() ? `\nThe primary action is: ${answers.action.trim()}` : ""}

THEME: ${theme.name}
Premise: ${theme.premise}
Palette (paper, ink, accent, muted, support): ${palette}
Type: display "${theme.typography.display}", body "${theme.typography.body}" (Google Fonts)
Voice: ${theme.voice}
Sample headline (direction, not a requirement): ${theme.sampleHeadline}
Section metaphors:
${list(theme.sectionMetaphors, "(none)")}

The theme is a point of view, not a costume: carry it through the grid, the rules, the labels and the illustrations, but never let the metaphor hide what the product does.

${HARD_CONSTRAINTS(req)}

Write the page now.`;
}

const INSTRUCTIONS = `You are a senior designer-writer who builds landing pages by hand. You write the copy and the code together, and you have strong taste.

${doctrinePrompt()}

You output only raw HTML. Your pages are short, specific and unmistakably made by a person for one product.`;

// --- html extraction -------------------------------------------------------

const DOC_START = /<!doctype html|<html[\s>]/i;
const DOC_END = /<\/html\s*>/i;
const HOLD_BACK = 16;

/**
 * Incrementally pulls the HTML document out of a model's text stream:
 * drops anything before `<!doctype`/`<html` (fences, chatter) and anything after `</html>`.
 */
class HtmlExtractor {
  private buffer = "";
  private state: "pre" | "body" | "done" = "pre";
  html = "";

  push(chunk: string): string {
    if (this.state === "done") return "";
    this.buffer += chunk;

    if (this.state === "pre") {
      const match = DOC_START.exec(this.buffer);
      if (!match) {
        // Give up waiting for a doctype after a while and treat the text as the body.
        if (this.buffer.length < 4000) return "";
        this.buffer = this.buffer.replace(/^[\s\S]*?```(?:html)?\s*/i, "");
        this.state = "body";
        return this.emit("<!doctype html>\n");
      }
      this.buffer = this.buffer.slice(match.index);
      this.state = "body";
      if (!/^<!doctype/i.test(this.buffer))
        return this.emit("<!doctype html>\n") + this.drain();
    }
    return this.drain();
  }

  /** Flush whatever is held back once the model stream ends. */
  end(): string {
    if (this.state === "pre") {
      const body = this.buffer.replace(/```(?:html)?/gi, "").trim();
      this.buffer = "";
      this.state = "done";
      return body ? this.emit("<!doctype html>\n" + body) : "";
    }
    if (this.state === "done") return "";
    const rest = this.buffer.replace(/\s*```\s*$/, "");
    this.buffer = "";
    this.state = "done";
    return this.emit(rest);
  }

  private drain(): string {
    const end = DOC_END.exec(this.buffer);
    if (end) {
      const out = this.buffer.slice(0, end.index + end[0].length);
      this.buffer = "";
      this.state = "done";
      return this.emit(out);
    }
    // Hold back a tail so a closing tag or fence split across chunks is still recognized.
    if (this.buffer.length <= HOLD_BACK) return "";
    const out = this.buffer.slice(0, -HOLD_BACK);
    this.buffer = this.buffer.slice(-HOLD_BACK);
    return this.emit(out);
  }

  private emit(text: string): string {
    this.html += text;
    return text;
  }
}

/** Non-streaming variant for the revision pass. */
export function extractHtml(text: string): string {
  const x = new HtmlExtractor();
  x.push(text);
  x.end();
  return x.html.trim();
}

// --- scoring & revision ----------------------------------------------------

/**
 * Scores the generated page exactly the way /api/analyze scored the original:
 * detectors plus the judge's findings, blended with the judge's tenet scores.
 * A detector-only number would sit on a softer scale than the original's, so
 * if the judge was available for the original but fails here, the re-score
 * counts as failed (null) rather than reporting an incomparable score.
 */
async function rescore(
  html: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<{ score: Score; findings: Finding[] } | null> {
  if (signal.aborted || timeoutMs <= 0) return null;
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  try {
    const capture = await captureHtml(html, undefined, bounded);
    const { findings } = runDetectors(capture);
    const judged = await judgePage(capture, findings, bounded, {
      fiveSecond: false,
    });
    if (hasGateway() && Object.keys(judged.tenetScores).length === 0) {
      throw new Error("the judge did not score the generated page");
    }
    const all = [...findings, ...judged.findings];
    return { score: scoreReport(all, judged.tenetScores), findings: all };
  } catch (error) {
    if (!signal.aborted) console.error("[generate] re-score failed", error);
    return null;
  }
}

async function revise(
  req: GenerateRequest,
  html: string,
  remaining: Finding[],
  timeoutMs: number,
  signal: AbortSignal,
): Promise<string | null> {
  const issues = remaining
    .filter((f) => f.severity !== "low" || f.weight >= 0.5)
    .slice(0, 20)
    .map(findingLine);
  if (!issues.length) return null;

  try {
    const { text } = await generateText({
      model: MODELS.page,
      instructions: INSTRUCTIONS,
      prompt: `${buildPrompt(req)}

You already wrote the page below. An automated audit of the rendered page still found these problems:
${list(issues, "")}

Return the full corrected HTML document. Fix every problem listed, keep everything that already works (copy, theme, structure), and keep all hard constraints.

<current_page>
${html}
</current_page>`,
      maxOutputTokens: 32_000,
      maxRetries: 0,
      timeout: timeoutMs,
      abortSignal: signal,
    });
    const revised = extractHtml(text);
    return revised.length > 500 && DOC_END.test(revised) ? revised : null;
  } catch (error) {
    if (!signal.aborted) console.error("[generate] revision failed", error);
    return null;
  }
}

function scoreComment(payload: {
  score: Score | null;
  generationId?: string;
  error?: string;
}): string {
  // A literal "-->" inside a JSON string would end the comment early; "\u003e" parses back to ">".
  return `\n${SCORE_MARKER}${JSON.stringify(payload).replace(/-->/g, "--\\u003e")}-->`;
}

// --- stream ----------------------------------------------------------------

/**
 * Streams the generated page, then the optional revision and the final score
 * comment. `signal` (the request's) and stream cancellation both stop all
 * remaining work: the model calls, the revision and the browser captures.
 * `persist` is false when the caller isn't the report's author.
 */
export function streamPage(
  req: GenerateRequest,
  options: { signal?: AbortSignal; persist?: boolean } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const startedAt = Date.now();
  const persist = options.persist ?? true;
  let closed = false;
  if (options.signal?.aborted) abort.abort();
  options.signal?.addEventListener("abort", () => abort.abort(), {
    once: true,
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => {
        if (!closed && text) controller.enqueue(encoder.encode(text));
      };
      const finish = (payload: Parameters<typeof scoreComment>[0]) => {
        if (closed) return;
        write(scoreComment(payload));
        closed = true;
        controller.close();
      };

      // 1. Stream the page.
      const extractor = new HtmlExtractor();
      let streamError: unknown = null;
      try {
        const result = streamText({
          model: MODELS.page,
          instructions: INSTRUCTIONS,
          prompt: buildPrompt(req),
          maxOutputTokens: 32_000,
          maxRetries: 1,
          abortSignal: abort.signal,
          timeout: { totalMs: 200_000, firstChunkMs: 60_000 },
          onError({ error }) {
            streamError = error;
          },
        });
        for await (const delta of result.textStream) {
          write(extractor.push(delta));
        }
        write(extractor.end());
      } catch (error) {
        streamError = error;
        write(extractor.end());
      }

      if (abort.signal.aborted) return;
      let html = extractor.html.trim();
      if (html.length < 200 || !DOC_END.test(html)) {
        console.error("[generate] page generation failed", streamError);
        return finish({
          score: null,
          error: "The page could not be generated. Please try again.",
        });
      }

      // 2. Re-score the generated page; maybe one silent revision.
      const elapsed = () => Date.now() - startedAt;
      let scored = await rescore(html, abort.signal, BUDGET_MS - elapsed());
      if (abort.signal.aborted) return;
      if (
        scored &&
        scored.score.total > REVISION_THRESHOLD &&
        BUDGET_MS - elapsed() > MIN_REVISION_MS
      ) {
        const revised = await revise(
          req,
          html,
          scored.findings,
          BUDGET_MS - elapsed() - RESCORE_RESERVE_MS,
          abort.signal,
        );
        if (revised && !abort.signal.aborted) {
          const rescored = await rescore(
            revised,
            abort.signal,
            BUDGET_MS - elapsed(),
          );
          // Only swap if the revision measurably helped (or we couldn't measure it but it rendered).
          if (rescored && rescored.score.total < scored.score.total) {
            html = revised;
            scored = rescored;
            write(`\n${REPLACE_MARKER}\n${revised}`);
          }
        }
      }
      if (abort.signal.aborted) return;

      // 3. Persist (best effort) and close with the score.
      let generationId: string | undefined;
      if (scored && persist) {
        try {
          const saved = await saveGeneration(req.reportId, {
            html,
            score: scored.score,
            selectedFindingIds: req.selectedFindingIds,
            theme: req.theme,
          });
          generationId = saved.id;
        } catch (error) {
          console.error("[generate] saveGeneration failed", error);
        }
      }
      finish({ score: scored?.score ?? null, generationId });
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
}
