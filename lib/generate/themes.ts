import { generateText, Output } from "ai";
import { z } from "zod";

import { MODELS } from "@/lib/ai";
import { doctrinePrompt } from "@/lib/doctrine";
import type { InterviewAnswers, Theme, ThemesRequest } from "@/lib/types";

import { QUESTIONS } from "./questions";

const HEX = /^#[0-9a-fA-F]{6}$/;

const themeSchema = z.object({
  name: z
    .string()
    .describe("Two to four words. A point of view, not a style label."),
  premise: z
    .string()
    .describe(
      "One sentence: the idea behind the theme and which interview detail it comes from.",
    ),
  palette: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            "Role first, e.g. 'paper', 'ink', 'accent', 'muted', 'rule'.",
          ),
        hex: z.string().describe("Six-digit hex, e.g. #1f2a24"),
      }),
    )
    .describe(
      "4 or 5 colors in this order: paper (background), ink (body text), accent (the one CTA color), muted (secondary text), optional rule/support.",
    ),
  typography: z.object({
    display: z
      .string()
      .describe("Exact Google Fonts family name for headlines."),
    body: z.string().describe("Exact Google Fonts family name for body text."),
  }),
  voice: z.string().describe("One sentence describing how the copy sounds."),
  sampleHeadline: z
    .string()
    .describe(
      "A real headline for THIS product that names the customer's pain. Max 12 words.",
    ),
  sectionMetaphors: z
    .array(z.string())
    .describe(
      "3 to 5 section ideas expressed in the theme's metaphor, each 'Metaphor: what the section actually does'.",
    ),
});

const themesSchema = z.object({ themes: z.array(themeSchema) });

const INSTRUCTIONS = `You are an art director with strong opinions, proposing visual and verbal themes for a founder's landing page rewrite.

${doctrinePrompt()}

Propose exactly 3 themes. Each theme must:
- Come from the founder: their cultural references, games, hobbies, where they are from, their story. Say which detail in the premise. A founder who hikes and plays exploration games might get a cartography theme: contour-line rules, a legend for pricing, coordinates for the address.
- Be a genuinely different point of view from the other two (different metaphor, different palette temperature, different type mood). Not palette swaps of one template.
- Serve the product: the metaphor must make the product easier to understand, never bury it.
- Keep what is already unique about the current page (the uniqueness signals).
- Palette: 4 or 5 colors, ordered paper, ink, accent, muted, optional support. Ink on paper must reach WCAG AA (4.5:1) and muted on paper at least 4.5:1. The accent must work as a button background with readable text. One accent only. No purple-to-blue gradients, no neon-on-black defaults.
- Typography: a pairing of real Google Fonts families (exact family names), chosen for this product. Avoid the overused defaults (Inter, Roboto, Open Sans, Poppins, Montserrat) unless the theme truly argues for one.
- sampleHeadline names the pain in the customer's words (use the interview's pain answer when present), max 12 words, no category-speak ("AI-powered platform for...").
- No emoji. No brand or company names as references. No generic lexicon (unlock, seamless, supercharge, elevate, game-changer, revolutionize, effortless).`;

function interviewBlock(answers: InterviewAnswers): string {
  const lines = QUESTIONS.map((q) => {
    const value = answers[q.key]?.trim();
    return value ? `- ${q.question}\n  ${value.slice(0, 1200)}` : null;
  }).filter(Boolean);
  return lines.length
    ? lines.join("\n")
    : "(The founder skipped the interview. Work from the page itself.)";
}

function buildPrompt(req: ThemesRequest): string {
  const { report, answers } = req;
  const facts =
    report.productFacts.map((f) => `- ${f}`).join("\n") || "- (none extracted)";
  const unique =
    report.uniqueness.map((u) => `- ${u.title}: ${u.evidence}`).join("\n") ||
    "- (nothing distinctive found)";
  const problems = report.findings
    .filter((f) => f.severity !== "low")
    .slice(0, 12)
    .map((f) => `- ${f.title}`)
    .join("\n");

  return `Current page: ${report.title} (${report.url})

Product facts:
${facts}

Already distinctive, keep it:
${unique}

What is wrong with the current page:
${problems || "- (no major findings)"}

Interview:
${interviewBlock(answers)}

Propose the 3 themes.`;
}

// --- palette accessibility -------------------------------------------------

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Normalize hex values and nudge ink/muted until they pass AA on the paper color. */
function fixPalette(palette: Theme["palette"]): Theme["palette"] {
  const cleaned = palette
    .map((c) => {
      let hex = c.hex.trim();
      if (/^#?[0-9a-fA-F]{3}$/.test(hex)) {
        hex = "#" + hex.replace("#", "").replace(/./g, (ch) => ch + ch);
      }
      if (!hex.startsWith("#")) hex = "#" + hex;
      return { name: c.name.trim() || "color", hex: hex.toLowerCase() };
    })
    .filter((c) => HEX.test(c.hex))
    .slice(0, 5);

  if (cleaned.length < 4) return cleaned;
  const paper = cleaned[0].hex;
  const darkPaper = luminance(paper) < 0.18;
  for (const i of [1, 3]) {
    if (contrast(cleaned[i].hex, paper) < 4.5) {
      cleaned[i] = {
        ...cleaned[i],
        hex:
          i === 1
            ? darkPaper
              ? "#f4f1ea"
              : "#16140f"
            : darkPaper
              ? "#b9b4a8"
              : "#5a564d",
      };
    }
  }
  return cleaned;
}

function normalize(theme: z.infer<typeof themeSchema>): Theme | null {
  const palette = fixPalette(theme.palette);
  if (palette.length < 4) return null;
  return {
    name: theme.name.trim(),
    premise: theme.premise.trim(),
    palette,
    typography: {
      display: theme.typography.display.trim(),
      body: theme.typography.body.trim(),
    },
    voice: theme.voice.trim(),
    sampleHeadline: theme.sampleHeadline.trim(),
    sectionMetaphors: theme.sectionMetaphors
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5),
  };
}

// --- fallbacks -------------------------------------------------------------

/** Three restrained themes used only if the model fails twice. */
function fallbackThemes(req: ThemesRequest): Theme[] {
  const headline =
    req.answers.pain?.trim().split(/\s+/).slice(0, 12).join(" ") ||
    req.report.productFacts[0] ||
    req.report.title;
  return [
    {
      name: "Field Notes",
      premise:
        "A working notebook: plain paper, a pencil-dark ink and one red margin mark for the action.",
      palette: [
        { name: "paper", hex: "#f6f3ec" },
        { name: "ink", hex: "#1d1b17" },
        { name: "accent", hex: "#b3361d" },
        { name: "muted", hex: "#5d5850" },
        { name: "rule", hex: "#d9d3c5" },
      ],
      typography: { display: "Fraunces", body: "Source Serif 4" },
      voice:
        "First person, observational, short sentences that sound written by hand.",
      sampleHeadline: headline,
      sectionMetaphors: [
        "Entry: the problem as you first wrote it down",
        "Sketch: a diagram of how it works",
        "Margin note: proof beside each claim",
      ],
    },
    {
      name: "Workshop Manual",
      premise:
        "A repair manual: numbered steps, exploded diagrams and a single safety-orange button.",
      palette: [
        { name: "paper", hex: "#f2f2ef" },
        { name: "ink", hex: "#121417" },
        { name: "accent", hex: "#c2410c" },
        { name: "muted", hex: "#52575e" },
      ],
      typography: { display: "Space Grotesk", body: "IBM Plex Sans" },
      voice:
        "Precise and practical, every sentence an instruction or a measurement.",
      sampleHeadline: headline,
      sectionMetaphors: [
        "Step 1: the fault you are fixing",
        "Exploded view: the mechanism",
        "Spec sheet: numbers and limits",
      ],
    },
    {
      name: "Night Edition",
      premise:
        "A late newspaper edition: dark paper, a tight column grid and one bulletin-yellow call to action.",
      palette: [
        { name: "paper", hex: "#14161a" },
        { name: "ink", hex: "#eceae4" },
        { name: "accent", hex: "#f2c94c" },
        { name: "muted", hex: "#a7a59f" },
      ],
      typography: { display: "Playfair Display", body: "Libre Franklin" },
      voice:
        "Reported, not pitched: who, what, where and when, then the quote.",
      sampleHeadline: headline,
      sectionMetaphors: [
        "Front page: the story in one headline",
        "The report: how it works",
        "Letters: customers in their own words",
      ],
    },
  ];
}

/** Exactly 3 distinct themes grounded in the interview and the page. */
export async function proposeThemes(req: ThemesRequest): Promise<Theme[]> {
  const prompt = buildPrompt(req);
  const fallback = fallbackThemes(req);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: MODELS.themes,
        instructions: INSTRUCTIONS,
        prompt,
        output: Output.object({ schema: themesSchema }),
        temperature: attempt === 0 ? 0.9 : 0.7,
        maxOutputTokens: 4000,
        maxRetries: 1,
        timeout: 60_000,
      });

      const themes: Theme[] = [];
      const seen = new Set<string>();
      for (const raw of output.themes) {
        const theme = normalize(raw);
        const key = theme?.name.toLowerCase();
        if (theme && key && !seen.has(key)) {
          seen.add(key);
          themes.push(theme);
        }
        if (themes.length === 3) break;
      }
      if (themes.length >= 2) {
        // Top up with a fallback rather than failing the whole request.
        for (const f of fallback) {
          if (themes.length === 3) break;
          if (!seen.has(f.name.toLowerCase())) themes.push(f);
        }
        return themes;
      }
    } catch (error) {
      console.error(`[themes] attempt ${attempt + 1} failed`, error);
    }
  }
  return fallback;
}
