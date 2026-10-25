// Zod validators for the API bodies that take user input (shapes mirror lib/types.ts).
import { z } from "zod";

const text = (max: number) => z.string().max(max);

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

export const interviewSaveSchema = z.object({
  reportId: text(200).min(1),
  claimToken: text(200).optional(),
  answers: answersSchema,
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
