import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { config } from "@/lib/server/config.ts";
import { authConfigured, currentUser } from "@/lib/server/auth.ts";
import { Wordmark } from "@/components/logo.tsx";
import { Button } from "@/components/ui.tsx";

// Private operator sign-in. Not linked from the product: visitors use the
// public, read-only demo; only the operator needs to start checks and repairs.

export const metadata = { title: "Operator", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "That access code is not correct.",
  limited: "Too many attempts. Wait 10 minutes and try again.",
  unconfigured: "Operator access is not set up on this server.",
  origin: "The request came from another site and was blocked.",
};

export default async function OperatorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (config.publicDemo) notFound(); // no operator in the public demo
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  const configured = authConfigured();

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-[360px]">
        <Wordmark tone="page" />
        <h1 className="mt-8 text-xl font-semibold tracking-[-0.015em] text-ink">Operator</h1>
        {configured ? (
          <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-ink">
                Access code
              </label>
              <input
                id="code"
                name="code"
                type="password"
                required
                autoComplete="current-password"
                autoFocus
                aria-invalid={error === "invalid" ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
                className="mt-1.5 h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink shadow-sm placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </div>
            {error && ERRORS[error] ? (
              <p id="login-error" role="alert" className="text-sm text-fail">
                {ERRORS[error]}
              </p>
            ) : null}
            <Button type="submit" variant="primary" className="w-full">
              Sign in
            </Button>
          </form>
        ) : (
          <p role="alert" className="mt-6 text-sm text-ink-2">
            {ERRORS.unconfigured}
          </p>
        )}
        <Link href="/" className="mt-8 inline-flex text-sm font-medium text-accent-ink hover:underline">
          Back to the workspace
        </Link>
      </div>
    </main>
  );
}
