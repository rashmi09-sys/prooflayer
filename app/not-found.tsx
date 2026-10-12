import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <p className="font-mono text-sm text-ink-3">404</p>
        <h1 className="mt-2 text-lg font-semibold text-ink">This page does not exist, or you do not have access to it.</h1>
        <Link href="/" className="mt-5 inline-block text-sm font-medium text-accent-ink hover:underline">
          Go to your projects
        </Link>
      </div>
    </main>
  );
}
