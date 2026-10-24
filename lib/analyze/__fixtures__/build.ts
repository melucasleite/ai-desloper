import type { Box, Capture, ViewportCapture } from "@/lib/types";

/** Compact page description → a Capture with plausible boxes at 1440 and 390. */
export type Item =
  | {
      tag: "h1" | "h2" | "h3" | "p" | "li" | "blockquote" | "span" | "small";
      text: string;
      font?: string;
    }
  | { link: string; href?: string; button?: boolean }
  | {
      img: string;
      alt?: string;
      kind?: "img" | "svg" | "video" | "background";
      dims?: boolean;
      h?: number;
    };

export interface SectionSpec {
  tag?: string;
  items: Item[];
  /** Desktop alignment; mobile is always a single column. */
  centered?: boolean;
  minHeight?: { mobile?: number; desktop?: number };
}

export interface PageSpec {
  url: string;
  title: string;
  bodyFont: string;
  headingFont?: string;
  sections: SectionSpec[];
  colors: string[];
  backgrounds: string[];
  cls: number;
  lcp: number | null;
  /** Extra markup appended to <head>/<body> so html-based checks have something to read. */
  extraHtml?: string;
}

const VIEWPORTS = {
  mobile: {
    width: 390,
    height: 844,
    gutter: 16,
    maxText: 358,
    pad: 48,
    imgH: 240,
    scale: {
      h1: 40,
      h2: 30,
      h3: 22,
      p: 17,
      li: 17,
      blockquote: 18,
      span: 14,
      small: 13,
    },
  },
  desktop: {
    width: 1440,
    height: 900,
    gutter: 170,
    maxText: 680,
    pad: 96,
    imgH: 440,
    scale: {
      h1: 64,
      h2: 44,
      h3: 26,
      p: 18,
      li: 18,
      blockquote: 22,
      span: 15,
      small: 14,
    },
  },
} as const;

const GAP = 16;

function layout(
  spec: PageSpec,
  viewport: "mobile" | "desktop",
): ViewportCapture {
  const v = VIEWPORTS[viewport];
  const out: ViewportCapture = {
    viewport,
    width: v.width,
    height: v.height,
    fullHeight: 0,
    screenshot: "",
    firstViewport: "",
    blocks: [],
    links: [],
    images: [],
    sections: [],
  };
  let y = 0;
  for (const s of spec.sections) {
    const top = y;
    y += v.pad;
    const centered = viewport === "desktop" && s.centered;
    const place = (w: number, h: number): Box => {
      const x = centered ? (v.width - w) / 2 : v.gutter;
      const box = { x, y, width: w, height: h, viewport };
      y += h + GAP;
      return box;
    };
    const texts: string[] = [];
    for (const item of s.items) {
      if ("tag" in item) {
        const fs = v.scale[item.tag];
        const natural = item.text.length * fs * 0.5;
        const w = Math.min(v.maxText, Math.max(fs * 2, natural));
        const lines = Math.max(1, Math.ceil(natural / v.maxText));
        const heading = /^h/.test(item.tag);
        out.blocks.push({
          tag: item.tag,
          text: item.text,
          box: place(w, Math.round(lines * fs * 1.3)),
          fontFamily:
            item.font ??
            (heading ? (spec.headingFont ?? spec.bodyFont) : spec.bodyFont),
          fontSize: fs,
        });
        texts.push(item.text);
      } else if ("link" in item) {
        const w = item.button
          ? Math.min(v.maxText, item.link.length * 9 + 48)
          : Math.min(v.maxText, item.link.length * 8);
        out.links.push({
          text: item.link,
          href: item.href ?? "#",
          isButton: !!item.button,
          box: place(w, item.button ? 52 : 24),
        });
        texts.push(item.link);
      } else {
        const h = item.h ?? v.imgH;
        out.images.push({
          src: item.img,
          alt: item.alt ?? "",
          kind: item.kind ?? "img",
          hasDimensions: item.dims ?? true,
          box: place(
            viewport === "mobile" ? v.maxText : Math.min(1100, v.maxText * 1.4),
            h,
          ),
        });
      }
    }
    y += v.pad;
    const min = s.minHeight?.[viewport] ?? 0;
    y = Math.max(y, top + min);
    out.sections.push({
      tag: s.tag ?? "section",
      box: { x: 0, y: top, width: v.width, height: y - top, viewport },
      text: texts.join("\n"),
      childCount: s.items.length,
    });
  }
  out.fullHeight = y;
  return out;
}

function toHtml(spec: PageSpec): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = spec.sections
    .map((s) => {
      const inner = s.items
        .map((i) => {
          if ("tag" in i) return `<${i.tag}>${esc(i.text)}</${i.tag}>`;
          if ("link" in i)
            return `<a href="${i.href ?? "#"}"${i.button ? ' class="btn"' : ""}>${esc(i.link)}</a>`;
          if (i.kind === "video")
            return `<video src="${i.img}"${i.dims === false ? "" : ' width="1280" height="720"'}></video>`;
          return `<img src="${i.img}" alt="${i.alt ?? ""}"${i.dims === false ? "" : ' width="1280" height="800"'}>`;
        })
        .join("\n");
      const tag = s.tag ?? "section";
      return `<${tag}>\n${inner}\n</${tag}>`;
    })
    .join("\n");
  return `<!doctype html><html><head><title>${esc(spec.title)}</title></head><body>\n${body}\n${spec.extraHtml ?? ""}\n</body></html>`;
}

export function buildCapture(spec: PageSpec): Capture {
  const desktop = layout(spec, "desktop");
  const mobile = layout(spec, "mobile");
  const html = toHtml(spec);
  const visibleText = spec.sections
    .flatMap((s) =>
      s.items.map((i) => ("tag" in i ? i.text : "link" in i ? i.link : "")),
    )
    .filter(Boolean)
    .join("\n");
  const fonts = [
    ...new Set(
      [spec.headingFont, spec.bodyFont].filter((f): f is string => !!f),
    ),
  ];
  return {
    url: spec.url,
    finalUrl: spec.url,
    title: spec.title,
    html,
    snapshotHtml: html,
    visibleText,
    fonts,
    colors: spec.colors,
    backgrounds: spec.backgrounds,
    cls: spec.cls,
    lcp: spec.lcp,
    desktop,
    mobile,
  };
}
