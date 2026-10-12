import { NextResponse, type NextRequest } from "next/server";
import { resolvePublicDemo } from "./lib/server/config.ts";

// Runs before every route (static assets excluded by the matcher).
//
// 1. Public demo: a second, independent read-only boundary. Only GET and HEAD
//    reach the app, and operator-only paths do not exist. Every route also
//    rejects these requests itself (lib/server/api.ts); this layer means a
//    route that forgot to would still be unreachable.
// 2. Every page gets a per-request nonce Content-Security-Policy.

const publicDemo = resolvePublicDemo();

/** Operator-only paths, absent from the public demo. */
const OPERATOR_ONLY = [
  /^\/operator(\/|$)/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/health(\/|$)/,
  /^\/api\/projects\/[^/]+\/(commits|requests|neverbreak)(\/|$)/,
  /^\/api\/runs\/[^/]+\/(repair|cancel|explain)(\/|$)/,
  /^\/p\/[^/]+\/verify(\/|$)/,
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // A malformed percent-encoding would otherwise surface as a 500 from route matching.
  try {
    decodeURIComponent(pathname);
  } catch {
    return new NextResponse("Bad request", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }

  if (publicDemo) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return NextResponse.json(
        { error: { code: "read_only_demo", message: "This is a read-only public demo. Nothing can be run or changed here." } },
        { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } },
      );
    }
    if (OPERATOR_ONLY.some((re) => re.test(pathname))) {
      return pathname.startsWith("/api/")
        ? NextResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404, headers: { "Cache-Control": "no-store" } })
        : new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
  }

  // API responses and recorded previews set their own headers (previews carry a sandbox CSP).
  if (pathname.startsWith("/api/") || pathname.startsWith("/preview/")) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // React renders style attributes; motion animates through the CSSOM. No inline <style> from user data exists.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
