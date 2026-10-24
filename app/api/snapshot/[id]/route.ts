import { getSnapshot } from "@/lib/db/reports";

// Serves the frozen original page from our origin, for a sandboxed iframe.
// The snapshot is attacker-controlled markup (the in-page serializer is only
// best-effort cleanup), so these headers are the boundary. Nothing but styles,
// images and fonts may load (URLs were absolutized at capture time, and the
// injected <base> covers the rest), and nothing may run.
//
// Inside our own split view the iframe's `sandbox="allow-same-origin"` already
// blocks scripts, forms and navigation, and the parent needs same-origin access
// to sync scrolling. Anything else (opened top-level from a link, or a fetch
// with no Sec-Fetch-Dest) also gets CSP `sandbox` with no allow-* tokens: an
// opaque origin, so the page can never act as ours.
const BASE_CSP = [
  "default-src 'none'",
  "style-src * 'unsafe-inline'",
  "img-src * data:",
  "font-src * data:",
  "script-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "worker-src 'none'",
];

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const html = await getSnapshot(id);

  if (html === null) {
    return new Response("Snapshot not found.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const framed = request.headers.get("sec-fetch-dest") === "iframe";
  const csp = (framed ? BASE_CSP : ["sandbox", ...BASE_CSP]).join("; ");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      // The two variants must never be served from cache for each other.
      Vary: "Sec-Fetch-Dest",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
