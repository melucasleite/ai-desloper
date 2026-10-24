import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Headless browser packages ship native binaries and must not be bundled.
  serverExternalPackages: [
    "playwright-core",
    "playwright",
    "@sparticuz/chromium",
  ],
  // The compressed chromium binary is read at runtime, so tracing can't see it.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
