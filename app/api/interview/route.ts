import { acknowledge } from "@/lib/generate/interview";
import { interviewAckSchema, parseBody } from "@/lib/generate/schemas";
import { rateLimited } from "@/lib/rate-limit";

export const maxDuration = 30;

export async function POST(request: Request) {
  const limited = rateLimited(request, "interview");
  if (limited) return limited;

  const body = await parseBody(request, interviewAckSchema);
  if ("response" in body) return body.response;

  const reply = await acknowledge(body.data);
  return Response.json({ reply }, { headers: { "cache-control": "no-store" } });
}
