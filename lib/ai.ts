// Gateway model strings, kept in one place. Plain "provider/model" strings
// resolve through the Vercel AI Gateway (AI_GATEWAY_API_KEY or Vercel OIDC).
export const MODELS = {
  judge: "anthropic/claude-sonnet-5-5",
  interview: "anthropic/claude-sonnet-5-5",
  themes: "anthropic/claude-sonnet-5-5",
  page: "anthropic/claude-opus-5-5",
} as const;

export type ModelRole = keyof typeof MODELS;

/** True when the gateway has credentials; lets callers skip LLM work fast. */
export function hasGateway(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN,
  );
}
