import { generateText } from "ai";

import { MODELS } from "@/lib/ai";
import type { InterviewAckRequest, InterviewKey } from "@/lib/types";

import { QUESTIONS } from "./questions";

export { QUESTIONS, type InterviewQuestion } from "./questions";

const NEUTRAL_REPLIES = [
  "Noted. That goes straight into the page.",
  "Got it. That will shape the rewrite.",
  "Thanks, that is exactly the kind of detail we need.",
];

const EMOJI_RE =
  /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;

function neutralReply(key: InterviewKey): string {
  const index = QUESTIONS.findIndex((q) => q.key === key);
  return NEUTRAL_REPLIES[Math.max(0, index) % NEUTRAL_REPLIES.length];
}

/** Trim model output to one clean line of at most `maxWords` words. */
function tidy(raw: string, maxWords = 25): string {
  let text = raw
    .replace(EMOJI_RE, "")
    .replace(/^["'“‘\s]+|["'”’\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ");
  if (words.length > maxWords) {
    // Prefer cutting at a sentence end inside the limit.
    const clipped = words.slice(0, maxWords).join(" ");
    const lastStop = Math.max(
      clipped.lastIndexOf(". "),
      clipped.lastIndexOf("? "),
    );
    text =
      lastStop > 20
        ? clipped.slice(0, lastStop + 1)
        : clipped.replace(/[,;:—-]+$/, "") + ".";
  }
  return text;
}

const ACK_INSTRUCTIONS = `You are interviewing a founder so you can rewrite their landing page in their own voice.
After each answer you reply with ONE short acknowledgment.

Rules:
- At most 25 words. One or two sentences. Plain text.
- Reference something specific from their answer: a word, a detail, a place, a name.
- When it is natural, say how that detail could show up on the page (a headline, the founder note, the theme, the button).
- Warm, direct and human, like a sharp editor across the table. Not a cheerleader.
- Never flatter: no "great answer", "love this", "amazing", "awesome", "fantastic".
- No emoji, no exclamation marks, no questions back, no quotation marks around the whole reply.
- Do not use filler marketing words such as unlock, seamless, elevate, supercharge, game-changer.`;

/**
 * One short, specific acknowledgment for an interview answer.
 * Never throws: on any failure it returns a neutral line.
 */
export async function acknowledge(req: InterviewAckRequest): Promise<string> {
  const answer = req.answer.trim();
  if (!answer) return "Skipped. We will work with what the page already says.";

  const facts = req.productFacts
    .slice(0, 8)
    .map((f) => `- ${f}`)
    .join("\n");
  const earlier = Object.entries(req.answers)
    .filter(
      ([key, value]) =>
        key !== req.key && typeof value === "string" && value.trim(),
    )
    .map(([key, value]) => `- ${key}: ${String(value).slice(0, 300)}`)
    .join("\n");

  const prompt = [
    facts && `What the product is (from their current page):\n${facts}`,
    earlier && `Earlier answers:\n${earlier}`,
    `Question: ${req.question}`,
    `Their answer: ${answer.slice(0, 2000)}`,
    "Your acknowledgment:",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const { text } = await generateText({
      model: MODELS.interview,
      instructions: ACK_INSTRUCTIONS,
      prompt,
      maxOutputTokens: 120,
      temperature: 0.7,
      maxRetries: 1,
      timeout: 12_000,
    });
    const reply = tidy(text.replace(/!/g, "."));
    return reply.length >= 8 ? reply : neutralReply(req.key);
  } catch (error) {
    console.error("[interview] acknowledge failed", error);
    return neutralReply(req.key);
  }
}
