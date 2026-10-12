import { NextResponse } from "next/server";
import { sameOrigin, signOut } from "@/lib/server/auth.ts";
import { config } from "@/lib/server/config.ts";
import { notAvailable } from "@/lib/server/api.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (config.publicDemo) return notAvailable();
  if (!(await sameOrigin())) return NextResponse.redirect(new URL("/", req.url), 303);
  await signOut();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
