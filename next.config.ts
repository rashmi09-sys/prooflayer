import type { NextConfig } from "next";
import { resolvePublicDemo } from "./lib/server/config.ts";

const base = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Browsers ignore HSTS over plain http, so this is harmless locally.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  // Files read at runtime through paths built from process.cwd(), so tracing can't
  // see them: the schema, and the public demo's read-only snapshot (built by
  // `npm run demo:snapshot`; absent in private builds). Private data in .data is
  // never bundled.
  outputFileTracingIncludes: {
    "/**": resolvePublicDemo() ? ["./db/schema.sql", "./.demo-snapshot/**/*"] : ["./db/schema.sql"],
  },
  outputFileTracingExcludes: {
    "/**": ["./.data/**/*", "./.env*", "./fixtures/**/*", "./demo/**/*"],
  },
  async headers() {
    return [
      // Pages get a nonce Content-Security-Policy from proxy.ts.
      // Everything except interactive previews may never be framed.
      { source: "/((?!preview/).*)", headers: [...base, { key: "X-Frame-Options", value: "DENY" }, { key: "Cross-Origin-Opener-Policy", value: "same-origin" }] },
      // Previews of a verified build may only be framed by ProofLayer itself.
      { source: "/preview/:path*", headers: [...base, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
