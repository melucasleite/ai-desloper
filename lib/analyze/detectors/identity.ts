import {
  type Detector,
  type DetectorResult,
  boxesOf,
  countMatches,
  familyName,
  finding,
  humanList,
  plural,
  status,
} from "./util";

const DEFAULT_FONTS = new Set(
  [
    "inter",
    "system-ui",
    "-apple-system",
    "blinkmacsystemfont",
    "ui-sans-serif",
    "sans-serif",
    "roboto",
    "arial",
    "helvetica",
    "helvetica neue",
    "segoe ui",
    "open sans",
    "poppins",
    "montserrat",
    "lato",
    "geist",
    "plus jakarta sans",
    "dm sans",
    "manrope",
  ].map((f) => f.toLowerCase()),
);

/** The out-of-the-box utility-framework palette most generated pages ship with. */
const DEFAULT_PALETTE: [number, number, number][] = [
  [99, 102, 241], // indigo-500
  [79, 70, 229], // indigo-600
  [129, 140, 248], // indigo-400
  [139, 92, 246], // violet-500
  [124, 58, 237], // violet-600
  [168, 85, 247], // purple-500
  [147, 51, 234], // purple-600
  [59, 130, 246], // blue-500
  [37, 99, 235], // blue-600
  [236, 72, 153], // pink-500
  [15, 23, 42], // slate-900
  [30, 41, 59], // slate-800
  [100, 116, 139], // slate-500
  [17, 24, 39], // gray-900
  [107, 114, 128], // gray-500
  [243, 244, 246], // gray-100
];

const UTILITY_CLASS_RE =
  /\b(?:bg|text|from|via|to|border|ring)-(?:indigo|violet|purple|blue|slate|gray|zinc|pink)-(?:50|[1-9]00|950)\b/g;
const GLASS_RE =
  /backdrop-filter\s*:\s*blur|backdrop-blur|-webkit-backdrop-filter/i;
const ICON_SET_RE =
  /\b(lucide|heroicons?|feather-|data-feather|fa-solid|fa-regular|fa-brands|class="[^"]*\bfa\b|material-icons|material-symbols|bi bi-|ionicon|tabler-icon|phosphor)\b/gi;

type Hue = "purple" | "blue" | "other" | "grey";

function parseColors(
  value: string,
): { rgb?: [number, number, number]; hue: Hue }[] {
  const out: { rgb?: [number, number, number]; hue: Hue }[] = [];
  for (const m of value.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4)
      h = [...h.slice(0, 3)].map((c) => c + c).join("");
    const rgb: [number, number, number] = [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
    out.push({ rgb, hue: hueOfRgb(rgb) });
  }
  for (const m of value.matchAll(
    /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/gi,
  )) {
    const rgb: [number, number, number] = [
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
    ];
    out.push({ rgb, hue: hueOfRgb(rgb) });
  }
  for (const m of value.matchAll(
    /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/gi,
  )) {
    const c = Number(m[2]);
    const h = Number(m[3]);
    out.push({
      hue:
        c < 0.04
          ? "grey"
          : h >= 275 && h <= 330
            ? "purple"
            : h >= 225 && h < 275
              ? "blue"
              : "other",
    });
  }
  return out;
}

function hueOfRgb(rgb: [number, number, number]): Hue {
  const max = Math.max(...rgb) / 255;
  const min = Math.min(...rgb) / 255;
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.25 || d < 0.08) return "grey";
  const h = hueAngle(rgb);
  if (h >= 245 && h <= 300) return "purple";
  if (h >= 195 && h < 245) return "blue";
  return "other";
}

function hueAngle([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export const detectIdentity: Detector = (capture) => {
  const out: DetectorResult = { findings: [], statuses: [] };
  const blocks = [...capture.desktop.blocks, ...capture.mobile.blocks];

  // Fonts.
  const used = blocks.map((b) => familyName(b.fontFamily)).filter(Boolean);
  const families = [
    ...new Set([...capture.fonts.map(familyName), ...used].filter(Boolean)),
  ];
  const nonDefault = families.filter(
    (f) => !DEFAULT_FONTS.has(f.toLowerCase()),
  );
  if (families.length) {
    const msg =
      families.length === 1
        ? `Fonts: ${families[0]}, ${families[0]}, and ${families[0]}`
        : `Fonts: ${humanList(families.slice(0, 4))}`;
    out.statuses.push(status(msg, blocks[0]?.box));
  }
  if (families.length && nonDefault.length === 0) {
    out.findings.push(
      finding({
        id: "default-fonts",
        tenet: "identity",
        severity: families.length === 1 ? "medium" : "low",
        title: "Only default typefaces",
        detail: `${humanList(families)} ${families.length === 1 ? "is" : "are"} what a page gets when nobody picks a typeface for it.`,
        evidence: families,
        boxes: boxesOf(
          blocks.filter((b) => /^h[12]$/i.test(b.tag)),
          2,
        ),
        weight: 0.4,
      }),
    );
  }

  // Purple-to-blue gradients.
  const gradients = capture.backgrounds.filter((b) => /gradient\(/i.test(b));
  const purpleBlue = gradients.filter((g) => {
    const hues = new Set(parseColors(g).map((c) => c.hue));
    return (
      hues.has("purple") &&
      (hues.has("blue") ||
        [...parseColors(g)].filter((c) => c.hue === "purple").length >= 2)
    );
  });
  const gradientClasses = countMatches(
    capture.html,
    /\bfrom-(?:indigo|violet|purple)-\d{2,3}\b[^"']*\bto-(?:blue|indigo|cyan|sky|pink)-\d{2,3}\b/,
  );
  if (purpleBlue.length || gradientClasses) {
    out.findings.push(
      finding({
        id: "purple-gradient",
        tenet: "identity",
        severity: "high",
        title: "The purple-to-blue gradient",
        detail:
          "This gradient is the single most recognisable sign of a generated page; it signals template before a word is read.",
        evidence: purpleBlue.slice(0, 3).map((g) => g.slice(0, 120)),
        weight: 0.5,
      }),
    );
    out.statuses.push(
      status(
        `${plural(purpleBlue.length + gradientClasses, "purple-to-blue gradient")}. Of course.`,
      ),
    );
  }

  // Glassmorphism.
  if (
    GLASS_RE.test(capture.html) ||
    capture.backgrounds.some((b) => GLASS_RE.test(b))
  ) {
    out.findings.push(
      finding({
        id: "glassmorphism",
        tenet: "identity",
        severity: "medium",
        title: "Frosted-glass cards",
        detail:
          "Blurred translucent panels are a trend effect, not an identity, and they cost contrast.",
        weight: 0.3,
      }),
    );
  }

  // Default utility palette.
  const allColors = [...capture.colors, ...capture.backgrounds];
  const parsed = allColors.flatMap(parseColors);
  const paletteHits = new Set<string>();
  for (const c of parsed) {
    if (!c.rgb) continue;
    const hit = DEFAULT_PALETTE.find(
      (p) =>
        Math.abs(p[0] - c.rgb![0]) +
          Math.abs(p[1] - c.rgb![1]) +
          Math.abs(p[2] - c.rgb![2]) <=
        6,
    );
    if (hit) paletteHits.add(hit.join(","));
  }
  const classHits = new Set(capture.html.match(UTILITY_CLASS_RE) ?? []);
  if (paletteHits.size >= 3 || classHits.size >= 6) {
    out.findings.push(
      finding({
        id: "default-palette",
        tenet: "identity",
        severity: paletteHits.size >= 5 ? "medium" : "low",
        title: "Untouched framework palette",
        detail:
          "The colors are the framework defaults, so the page looks like every other page built on it.",
        evidence: [
          ...[...paletteHits].map((p) => `rgb(${p})`),
          ...[...classHits].slice(0, 4),
        ],
        weight: 0.3,
      }),
    );
  }

  // Accent discipline: count distinct saturated hue families.
  const accents = new Set(
    parsed
      .filter((c) => c.rgb && c.hue !== "grey")
      .map((c) => Math.round(hueAngle(c.rgb!) / 30)),
  );
  if (accents.size >= 4) {
    out.findings.push(
      finding({
        id: "no-single-accent",
        tenet: "identity",
        severity: "low",
        title: `${accents.size} competing accent hues`,
        detail:
          "One accent color tells the eye where to go; several tell it nothing.",
        weight: 0.2,
      }),
    );
  }

  // Stock icon sets.
  const icons = countMatches(capture.html, ICON_SET_RE);
  if (icons >= 3) {
    out.findings.push(
      finding({
        id: "stock-icons",
        tenet: "identity",
        severity: "low",
        title: "Stock icon set",
        detail:
          "The same outline icons ship on thousands of pages; they decorate the feature grid without explaining it.",
        evidence: [`${icons} icons from a stock set`],
        weight: 0.2,
      }),
    );
  }

  // Everything centered.
  const vp = capture.desktop;
  const text = vp.blocks.filter(
    (b) => b.text.trim().length > 0 && b.box.width < vp.width * 0.8,
  );
  const centered = text.filter(
    (b) => Math.abs(b.box.x + b.box.width / 2 - vp.width / 2) < 12,
  );
  if (text.length >= 10 && centered.length / text.length >= 0.85) {
    out.findings.push(
      finding({
        id: "everything-centered",
        tenet: "identity",
        severity: "medium",
        title: "Every block is centered",
        detail:
          "Centering everything is the absence of a grid; long centered text is also harder to read.",
        evidence: [`${centered.length} of ${text.length} text blocks centered`],
        boxes: boxesOf(centered, 4),
        weight: 0.3,
      }),
    );
    out.statuses.push(
      status(
        `${centered.length} of ${text.length} text blocks are centered on the page`,
      ),
    );
  }

  return out;
};
