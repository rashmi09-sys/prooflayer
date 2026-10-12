import { Camera, EyeOff } from "lucide-react";
import type { RunDetail } from "@/lib/server/run-detail.ts";
import { primaryShot } from "@/lib/shared/flows.ts";
import { primaryFailure } from "@/lib/ui/neverbreak.ts";
import { formatTimestamp, shortSha } from "@/lib/ui/format.ts";
import { RenderedPage } from "../proof-stage.tsx";

/**
 * The proof: the real page Chromium captured during this run, next to the
 * protected flow, what it should show and what it showed. The screenshot is
 * never altered; the highlight is a separate layer from coordinates the
 * browser measured, and only appears when the value was found on the page.
 */
export function VisualProof({ detail, animate = false }: { detail: RunDetail; animate?: boolean }) {
  const { run } = detail;
  const shot = primaryShot(detail.artifacts);
  const flows = detail.neverbreak?.flows ?? [];
  const broken = primaryFailure(flows);
  const snap = detail.checks.find((c) => c.key === "snapshot");
  const proof = detail.proofs[0];
  const typeErr = proof?.kind === "type" ? proof.items[0] : null;
  const expected = broken?.expected ?? (typeErr?.expectedType ?? null);
  const actual = broken?.actual ?? (typeErr?.receivedType ?? null);
  const failed = run.verdict === "failed";

  return (
    <section aria-labelledby="proof-heading" className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-[0_1px_2px_rgba(24,20,31,0.04),0_24px_48px_-28px_rgba(24,20,31,0.25)]">
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <div className="min-w-0 bg-surface-3 p-4 sm:p-6">
          <p className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 font-medium text-ink-2 shadow-sm">
              <Camera className="size-3.5" aria-hidden /> Captured evidence
            </span>
            {shot ? <span>Chromium · {formatTimestamp(shot.capturedAt)} · {shortSha(run.commitSha)}</span> : null}
          </p>
          {shot ? (
            <RenderedPage artifact={shot} runId={run.id} commitSha={run.commitSha} caption={false} tone="light" animate={animate} ringDelayMs={animate ? 600 : 0} />
          ) : (
            <div className="flex aspect-[16/8] max-h-[360px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-6 text-center">
              <EyeOff className="size-6 text-ink-3" aria-hidden />
              <p className="mt-3 text-sm font-medium text-ink">{run.status !== "completed" ? "The page is captured after the app builds" : "No screenshot for this run"}</p>
              <p className="mt-1 max-w-[42ch] text-xs leading-relaxed text-ink-3">{run.status !== "completed" ? "Nothing is shown until Chromium has actually opened it." : (snap?.summary ?? "It was recorded before browser capture existed.")}</p>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col p-5 sm:p-7">
          <h2 id="proof-heading" className="text-xs font-medium text-ink-3">
            {failed ? "Here's the proof" : run.verdict === "passed" ? "What the app showed" : "Proof"}
          </h2>
          {failed && broken ? (
            <>
              <p className="mt-2 text-sm font-medium text-ink-2">Protected flow</p>
              <p className="font-display text-[1.45rem] font-bold leading-tight tracking-[-0.02em] text-ink">{broken.flow.name}</p>
              <span className="mt-2 inline-flex w-fit items-center rounded-full bg-fail-soft px-2.5 py-0.5 text-xs font-semibold text-fail">Failed</span>
            </>
          ) : failed && typeErr ? (
            <p className="mt-2 font-display text-[1.45rem] font-bold leading-tight tracking-[-0.02em] text-ink">The app no longer builds.</p>
          ) : run.verdict === "passed" ? (
            <p className="mt-2 font-display text-[1.45rem] font-bold leading-tight tracking-[-0.02em] text-ink">Every protected flow passed.</p>
          ) : null}

          {expected && actual ? (
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Tile tone="pass" label={typeErr && !broken?.expected ? "Required" : "Expected"} value={expected} />
              <Tile tone="fail" label={typeErr && !broken?.actual ? "Passed in" : "Actual"} value={actual} />
            </div>
          ) : null}

          <p className="mt-5 text-[15px] leading-relaxed text-ink-2">{explain(detail, broken)}</p>
          <p hidden={run.status !== "completed"} className="mt-auto pt-5 text-xs leading-relaxed text-ink-3">
            {shot
              ? "Real screenshot from this run. The highlight marks where the test's value was found in the page text; the image itself is unaltered."
              : "Values come from the test runner's recorded output."}
          </p>
        </div>
      </div>
    </section>
  );
}

function explain(d: RunDetail, broken: ReturnType<typeof primaryFailure>): string {
  const { run } = d;
  if (run.verdict === "passed") return "Nothing that already worked was broken by this change.";
  if (run.status !== "completed") return "The proof appears here once the checks have finished.";
  if (broken?.expected && broken.actual && broken.testEdited && d.neverbreak?.attemptOf) {
    return `The test behind this flow expected ${broken.expected} and got ${broken.actual}. The original change had rewritten this test, so restoring the app code alone no longer matches it.`;
  }
  if (broken?.expected && broken.actual) {
    const hit = d.artifacts.flatMap((a) => a.annotations?.matches ?? []).find((m) => m.role === "received" && m.found);
    return hit?.text
      ? `The page now shows “${hit.text}”. Before this change, the same flow passed.`
      : `The test behind this flow expected ${broken.expected} and got ${broken.actual}.`;
  }
  const p = d.proofs[0];
  if (p?.kind === "type") return `TypeScript stopped the build: a ${p.items[0].receivedType ?? "value"} is passed where a ${p.items[0].expectedType ?? "different type"} is required (${p.items[0].file}:${p.items[0].line}). With no build, Chromium couldn't open the page.`;
  return run.verdictReason ?? "A required check failed.";
}

function Tile({ tone, label, value }: { tone: "pass" | "fail"; label: string; value: string }) {
  const size = value.length <= 8 ? "whitespace-nowrap text-[1.45rem] @[10rem]:text-[2rem]" : value.length <= 14 ? "text-lg @[10rem]:text-xl" : "text-base";
  return (
    <div className={`@container min-w-0 rounded-2xl border px-4 py-3.5 ${tone === "pass" ? "border-pass/25 bg-pass-soft" : "border-fail/25 bg-fail-soft"}`}>
      <p className={`text-xs font-semibold ${tone === "pass" ? "text-pass" : "text-fail"}`}>{label}</p>
      <p className={`mt-1 break-words font-mono font-semibold leading-none tracking-[-0.03em] text-ink ${size}`}>{value}</p>
    </div>
  );
}
