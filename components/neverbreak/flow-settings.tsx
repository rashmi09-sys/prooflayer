"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Learn flows again, and choose whether NeverBreak repairs on its own. */
export function FlowSettings({ project, autoRepair, canRelearn }: { project: string; autoRepair: boolean; canRelearn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function post(body: object, key: string) {
    setBusy(key);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${project}/neverbreak`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "That didn't work.");
      if (key === "relearn") setNote(data.added ? `Added ${data.added} new ${data.added === 1 ? "flow" : "flows"}.` : "No new flows: everything that passed is already protected.");
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-[15px] font-semibold text-ink">Safe repair</p>
        <p className="mt-1 text-sm text-ink-3">When a change breaks a flow, up to two repairs are tried on a separate branch and verified again: a prepared targeted fix when one exists, otherwise restoring or rolling back the code. No AI writes these.</p>
        <div role="radiogroup" aria-label="Safe repair" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {[
            { on: false, label: "Ask first" },
            { on: true, label: "Automatically" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={autoRepair === o.on}
              disabled={busy !== null}
              onClick={() => autoRepair !== o.on && post({ action: "auto-repair", on: o.on }, "auto")}
              className={`h-9 rounded-lg text-sm font-medium transition-colors ${autoRepair === o.on ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-[15px] font-semibold text-ink">Learn new flows</p>
        <p className="mt-1 text-sm text-ink-3">Protect every test that passed in the latest passing run. Existing flows are kept.</p>
        <button
          type="button"
          disabled={!canRelearn || busy !== null}
          onClick={() => post({ action: "relearn" }, "relearn")}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${busy === "relearn" ? "animate-spin" : ""}`} aria-hidden /> Learn from the latest passing run
        </button>
        {note ? (
          <p role="status" className="mt-2 text-xs text-ink-2">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
