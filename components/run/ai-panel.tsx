"use client";

import { useState } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import type { AiExplanation, CheckRecord } from "@/lib/shared/types.ts";
import { relativeTime } from "@/lib/ui/format.ts";
import { Button } from "../ui.tsx";
import { Source } from "../provenance.tsx";

/**
 * AI interpretation. Always in a dashed container and labeled as inference,
 * so it can never be mistaken for recorded evidence. It cannot change the
 * verdict and reads captured output only as untrusted data.
 */
export function AiPanel({
  runId,
  failed,
  explanations,
  aiConfigured,
  model,
  readOnly,
  onGenerated,
}: {
  runId: string;
  failed: CheckRecord[];
  explanations: AiExplanation[];
  aiConfigured: boolean;
  model: string;
  readOnly?: boolean;
  onGenerated: () => void;
}) {
  if (failed.length === 0) return null;
  return (
    <section aria-labelledby="ai-heading" className="rounded-xl border border-dashed border-accent/45 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="ai-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-accent" aria-hidden /> AI interpretation
        </h2>
        <Source kind="ai" />
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-3">A model’s guess at why. It cannot change the verdict.</p>

      {!aiConfigured && !readOnly ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
          <span>
            Off: <code className="font-mono">ANTHROPIC_API_KEY</code> isn’t set. Nothing on this page came from a model.
          </span>
        </p>
      ) : null}

      <div className="mt-3 space-y-4">
        {failed.map((c) => (
          <CheckExplanation
            key={c.id}
            runId={runId}
            check={c}
            latest={explanations.find((e) => e.checkId === c.id) ?? null}
            canRequest={aiConfigured && !readOnly}
            model={model}
            onGenerated={onGenerated}
            showName={failed.length > 1}
          />
        ))}
      </div>
    </section>
  );
}

function CheckExplanation({
  runId,
  check,
  latest,
  canRequest,
  model,
  onGenerated,
  showName,
}: {
  runId: string;
  check: CheckRecord;
  latest: AiExplanation | null;
  canRequest: boolean;
  model: string;
  onGenerated: () => void;
  showName: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/explain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkId: check.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (res.status !== 502) setError(body?.error?.message ?? "The explanation request failed.");
      }
      onGenerated();
    } catch {
      setError("Could not reach the ProofLayer server.");
    } finally {
      setBusy(false);
    }
  }

  const content = latest?.status === "ok" ? latest.content : null;

  return (
    <div>
      {showName ? <p className="text-xs font-medium text-ink-2">{check.name}</p> : null}
      {content ? (
        <div className="mt-1">
          <p className="text-sm leading-relaxed text-ink">{content.likelyCause}</p>
          {content.evidence.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {content.evidence.map((e, i) => (
                <li key={i} className="pl-scroll overflow-x-auto rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink-2">
                  {e}
                </li>
              ))}
            </ul>
          ) : null}
          {content.inspect.length ? <List title="Inspect" items={content.inspect} /> : null}
          {content.nextSteps.length ? <List title="Suggested next steps" items={content.nextSteps} /> : null}
          <p className="mt-2 text-[11px] text-ink-3">
            {content.confidence} confidence · {latest?.model} · {relativeTime(latest?.createdAt)}
          </p>
        </div>
      ) : latest?.status === "error" ? (
        <p role="alert" className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-xs text-ink-2">
          No explanation was generated. {latest.errorMessage}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-fail">
          {error}
        </p>
      ) : null}
      {canRequest ? (
        <Button size="sm" variant={content ? "ghost" : "secondary"} onClick={request} disabled={busy} aria-busy={busy} className="mt-2">
          <Sparkles className="size-3.5" aria-hidden />
          {busy ? "Asking the model…" : content ? "Generate again" : `Explain ${check.name.toLowerCase()} failure`}
        </Button>
      ) : null}
      {canRequest && !content ? <p className="mt-1.5 text-[11px] text-ink-3">Sends this step&apos;s sanitized output to {model}.</p> : null}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-2.5">
      <p className="text-xs font-medium text-ink-2">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-ink">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
