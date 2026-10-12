import { NextResponse } from "next/server";
import { authConfigured, sameOrigin, signIn } from "@/lib/server/auth.ts";
import { config } from "@/lib/server/config.ts";
import { LoginLimiter } from "@/lib/server/session.ts";
import { notAvailable } from "@/lib/server/api.ts";

export const dynamic = "force-dynamic";

const limiter = new LoginLimiter();

export async function POST(req: Request) {
  if (config.publicDemo) return notAvailable();
  const back = (q: string) => NextResponse.redirect(new URL(`/operator?${q}`, req.url), 303);
  if (!(await sameOrigin())) return back("error=origin");
  if (!authConfigured()) return back("error=unconfigured");

  // Behind a proxy that sets it (Vercel, a reverse proxy) the first X-Forwarded-For entry is the client;
  // where a client can forge it, the global limit still applies.
  const client = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!limiter.attempt(client)) return back("error=limited");
  if (Number(req.headers.get("content-length") ?? 0) > 4096) return back("error=invalid");

  const form = await req.formData().catch(() => null);
  const code = form?.get("code");
  if (typeof code === "string" && (await signIn(code))) {
    limiter.success(client);
    return NextResponse.redirect(new URL("/", req.url), 303);
  }
  return back("error=invalid");
}
