import { AppWindow, Braces, Calculator, FlaskConical, Fingerprint, ScanLine, Server, Sparkles } from "lucide-react";

export type SourceKind = "test-runner" | "compiler" | "linter" | "computed" | "worker" | "exit-codes" | "browser" | "ai";

const META: Record<SourceKind, { label: string; icon: typeof Sparkles; title: string }> = {
  "test-runner": { label: "Test runner", icon: FlaskConical, title: "Printed by the test runner during this run. Deterministic." },
  compiler: { label: "Compiler", icon: Braces, title: "Printed by the TypeScript compiler during this run. Deterministic." },
  linter: { label: "Linter", icon: ScanLine, title: "Printed by ESLint during this run. Deterministic." },
  computed: { label: "Computed", icon: Calculator, title: "Arithmetic on recorded values, done by ProofLayer. Deterministic." },
  worker: { label: "Worker", icon: Server, title: "Recorded by the verification worker." },
  "exit-codes": { label: "Exit codes", icon: Fingerprint, title: "Decided from recorded process exit codes." },
  browser: { label: "Browser", icon: AppWindow, title: "Captured by headless Chromium during this run." },
  ai: { label: "AI inference", icon: Sparkles, title: "Written by a language model. A hypothesis, not a recorded fact." },
};

/** Labels where a statement came from. AI is always visually distinct. */
export function Source({ kind, className = "" }: { kind: SourceKind; className?: string }) {
  const m = META[kind];
  const Icon = m.icon;
  const ai = kind === "ai";
  return (
    <span
      title={m.title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium ${
        ai ? "border border-dashed border-accent/60 text-accent-ink" : "border border-line-strong bg-surface-2 text-ink-2"
      } ${className}`}
    >
      <Icon className="size-3" aria-hidden />
      {m.label}
      <span className="sr-only"> (source)</span>
    </span>
  );
}
