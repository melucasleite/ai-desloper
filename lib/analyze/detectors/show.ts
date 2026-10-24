import type { ViewportCapture } from "@/lib/types";
import {
  type Detector,
  type DetectorResult,
  boxesOf,
  finding,
  plural,
  status,
} from "./util";

type Visual = ViewportCapture["images"][number];

const DECOR_RE =
  /(blob|gradient|abstract|shape|orb|wave|swirl|sphere|\b3d\b|-3d|3d-|hero-?bg|bg[-_]|background|decor|pattern|glow|noise|illustration|undraw|confetti|sparkle)/i;
const STOCK_RE =
  /(unsplash|pexels|shutterstock|istock|gettyimages|freepik|undraw|stock[-_]?photo|\bstock\b)/i;
const EXPLAIN_RE =
  /(screenshot|screen[-_ ]|dashboard|product|\bui\b|interface|demo|\bapp\b|before|after|diagram|report|preview|walkthrough|editor|inbox|example|sample|workflow)/i;
const LOGO_RE = /(logo|avatar|icon|favicon|badge)/i;

function fileName(src: string): string {
  const clean = src.split(/[?#]/)[0] ?? src;
  return clean.slice(clean.lastIndexOf("/") + 1) || src.slice(0, 60);
}

function classify(img: Visual): "explain" | "decor" | "neutral" {
  const hay = `${img.src} ${img.alt}`;
  if (img.kind === "video" || EXPLAIN_RE.test(hay)) return "explain";
  if (LOGO_RE.test(hay)) return "neutral";
  if (img.kind === "background" || DECOR_RE.test(hay) || STOCK_RE.test(hay))
    return "decor";
  if (img.kind === "svg" && !img.alt && img.box.width * img.box.height > 40_000)
    return "decor";
  return "neutral";
}

export const detectShow: Detector = (capture) => {
  const out: DetectorResult = { findings: [], statuses: [] };
  const vp = capture.desktop.images.length ? capture.desktop : capture.mobile;
  // Ignore icon-sized marks; they're craft, not visuals.
  const visuals = vp.images.filter(
    (i) => i.box.width >= 48 && i.box.height >= 48,
  );
  const explain = visuals.filter((i) => classify(i) === "explain");
  const decor = visuals.filter((i) => classify(i) === "decor");
  const stock = visuals.filter((i) => STOCK_RE.test(`${i.src} ${i.alt}`));

  out.statuses.push(
    status(
      visuals.length
        ? `${plural(visuals.length, "visual")}: ${explain.length} show the product, ${decor.length} are decoration`
        : "No images or video on the page",
      (explain[0] ?? decor[0])?.box,
    ),
  );

  if (explain.length === 0) {
    out.findings.push(
      finding({
        id: "no-product-visual",
        tenet: "show",
        severity: "high",
        title: "Nothing shows the product",
        detail:
          "No screenshot, demo or diagram of the actual thing, so visitors have to imagine what they're buying.",
        evidence: decor.slice(0, 3).map((i) => fileName(i.src)),
        boxes: boxesOf(decor, 3),
        weight: 0.6,
      }),
    );
  }

  if (
    decor.length >= 2 &&
    decor.length / Math.max(1, decor.length + explain.length) >= 0.5
  ) {
    out.findings.push(
      finding({
        id: "decorative-visuals",
        tenet: "show",
        severity: decor.length >= 4 ? "high" : "medium",
        title: `${plural(decor.length, "visual")} decorate instead of explain`,
        detail:
          "Blobs, abstract shapes and illustrations fill the space a real screenshot or before-and-after should own.",
        evidence: decor.map((i) => i.alt || fileName(i.src)),
        boxes: boxesOf(decor),
        weight: 0.45,
      }),
    );
  }

  if (stock.length) {
    out.findings.push(
      finding({
        id: "stock-imagery",
        tenet: "show",
        severity: "low",
        title: "Stock imagery",
        detail:
          "Stock art stands in for customers or a team the visitor can tell aren't real.",
        evidence: stock.map((i) => fileName(i.src)),
        boxes: boxesOf(stock),
        weight: 0.25,
      }),
    );
  }

  const media = [...capture.desktop.images, ...capture.mobile.images].filter(
    (i) => (i.kind === "img" || i.kind === "video") && !i.hasDimensions,
  );
  const unsized = new Map(media.map((m) => [m.src, m]));
  const totalMedia = new Set(
    [...capture.desktop.images, ...capture.mobile.images]
      .filter((i) => i.kind === "img" || i.kind === "video")
      .map((i) => i.src),
  ).size;
  if (unsized.size) {
    const list = [...unsized.values()];
    out.findings.push(
      finding({
        id: "unsized-media",
        tenet: "show",
        severity: unsized.size >= 3 ? "high" : "medium",
        title: `${plural(unsized.size, "image")} without reserved space`,
        detail:
          "Media without width/height or an aspect ratio pushes the page around as it loads.",
        evidence: list.map((i) => fileName(i.src)),
        boxes: boxesOf(list),
        weight: 0.35,
      }),
    );
    out.statuses.push(
      status(
        `${unsized.size} of ${totalMedia} images have no reserved size`,
        list[0]?.box,
      ),
    );
  }

  return out;
};
