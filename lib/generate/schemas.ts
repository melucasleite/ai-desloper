// Zod validators for the generation API bodies (shapes mirror lib/types.ts).
import { z } from "zod";

const text = (max: number) => z.string().max(max);

/** Accepts up to `hardMax` chars but keeps only the first `keep` for prompts. */
const clipped = (keep: number, hardMax = keep * 4) =>
  z
    .string()
    .max(hardMax)
    .transform((s) => s.slice(0, keep));

/** Accepts up to `hardMax` items but keeps only the first `keep`. */
const clippedList = <T extends z.ZodType>(
  item: T,
  keep: number,
  hardMax: number,
) =>
  z
    .array(item)
    .max(hardMax)
    .transform((a) => a.slice(0, keep));

const claimToken = text(200).optional();

export const interviewKey = z.enum([
  "story",
  "pain",
  "customer",
  "action",
  "culture",
  "games",
  "hobbies",
  "place",
  "hate",
]);

export const answersSchema = z
  .object({
    story: text(4000),
    pain: text(4000),
    customer: text(4000),
    action: text(4000),
    culture: text(4000),
    games: text(4000),
    hobbies: text(4000),
    place: text(4000),
    hate: text(4000),
  })
  .partial();

const box = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  viewport: z.enum(["desktop", "mobile"]),
});

const tenet = z.enum([
  "pain",
  "show",
  "action",
  "specificity",
  "voice",
  "economy",
  "identity",
  "speed",
]);

export const findingSchema = z.object({
  id: text(200),
  tenet: z.union([tenet, z.literal("markers")]),
  severity: z.enum(["low", "medium", "high"]),
  title: text(500),
  detail: text(2000),
  evidence: clippedList(clipped(300, 2000), 4, 12),
  boxes: z.array(box).max(40),
  weight: z.number(),
  source: z.enum(["detector", "judge"]),
});

const uniqueness = z.object({
  title: clipped(200, 500),
  evidence: clipped(600, 2000),
});

const metrics = z.object({
  mobileScreens: z.number(),
  cls: z.number(),
  lcp: z.number().nullable(),
  emojiCount: z.number(),
  emDashCount: z.number(),
  wordCount: z.number(),
  distinctCtaLabels: z.number(),
  headlineInFirstViewport: z.boolean(),
  ctaInFirstViewport: z.boolean(),
});

const score = z.object({
  total: z.number(),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  tenets: z.array(
    z.object({
      tenet,
      slop: z.number(),
      detector: z.number(),
      judge: z.number().nullable(),
    }),
  ),
  markersPenalty: z.number(),
});

export const themeSchema = z.object({
  name: text(200),
  premise: text(1000),
  palette: z
    .array(
      z.object({ name: text(100), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
    )
    .min(2)
    .max(8),
  typography: z.object({ display: text(100), body: text(100) }),
  voice: text(1000),
  sampleHeadline: text(500),
  sectionMetaphors: z.array(text(500)).max(10),
});

const productFacts = clippedList(clipped(300, 2000), 30, 40);

const reportBase = z.object({
  url: text(4000),
  title: text(1000),
  productFacts,
  uniqueness: clippedList(uniqueness, 6, 12),
  findings: z.array(findingSchema).max(80),
});

export const interviewAckSchema = z.object({
  reportId: text(200),
  key: interviewKey,
  question: text(1000),
  answer: text(4000),
  answers: answersSchema,
  productFacts,
});

export const themesRequestSchema = z.object({
  reportId: text(200),
  claimToken,
  answers: answersSchema,
  report: reportBase,
});

export const generateRequestSchema = z.object({
  reportId: text(200).min(1),
  claimToken,
  answers: answersSchema,
  theme: themeSchema,
  selectedFindingIds: z.array(text(200)).max(200),
  report: reportBase.extend({ metrics, score }),
});

/** Parse a JSON request body; returns a 400 Response on failure. */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T, unknown>,
): Promise<{ data: T } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      response: Response.json({ error: "Body must be JSON." }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: Response.json(
        { error: "Invalid request.", issues: z.treeifyError(parsed.error) },
        { status: 400 },
      ),
    };
  }
  return { data: parsed.data };
}
