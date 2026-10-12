import { Ban, Check, CircleDashed, CircleSlash, Loader, TriangleAlert, X } from "lucide-react";
import type { CheckStatus, Verdict } from "@/lib/shared/types.ts";
import { CHECK_STATUS_LABEL, VERDICT_COPY } from "@/lib/ui/format.ts";

const VERDICT_STYLE: Record<Verdict, string> = {
  passed: "bg-pass-soft text-pass border-pass/25",
  failed: "bg-fail-soft text-fail border-fail/25",
  incomplete: "bg-warn-soft text-warn border-warn/30",
  cancelled: "bg-muted-soft text-muted border-line-strong",
};

const VERDICT_ICON: Record<Verdict, typeof Check> = {
  passed: Check,
  failed: X,
  incomplete: TriangleAlert,
  cancelled: Ban,
};

export function VerdictBadge({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "lg" }) {
  const Icon = VERDICT_ICON[verdict];
  const lg = size === "lg";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-medium ${VERDICT_STYLE[verdict]} ${
        lg ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-xs"
      }`}
    >
      <Icon aria-hidden className={lg ? "size-4.5" : "size-3.5"} strokeWidth={2.5} />
      {VERDICT_COPY[verdict].label}
    </span>
  );
}

export function RunningBadge({ queued = false }: { queued?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">
      <span aria-hidden className={`size-1.5 rounded-full bg-accent ${queued ? "" : "pl-live-dot"}`} />
      {queued ? "Queued" : "Running"}
    </span>
  );
}

const CHECK_TONE: Record<CheckStatus, string> = {
  pending: "text-ink-3 border-line-strong bg-surface",
  running: "text-accent border-accent bg-accent-soft",
  passed: "text-pass border-pass bg-pass-soft",
  failed: "text-fail border-fail bg-fail-soft",
  skipped: "text-ink-3 border-line-strong bg-surface-2",
  error: "text-warn border-warn bg-warn-soft",
  cancelled: "text-muted border-line-strong bg-muted-soft",
};

/** Round status marker used on the evidence spine and in tables. */
export function CheckMarker({ status, size = 22 }: { status: CheckStatus; size?: number }) {
  const icon = {
    pending: <CircleDashed aria-hidden className="size-3" />,
    running: <Loader aria-hidden className="size-3 motion-safe:animate-spin" />,
    passed: <Check aria-hidden className="size-3" strokeWidth={3} />,
    failed: <X aria-hidden className="size-3" strokeWidth={3} />,
    skipped: <CircleSlash aria-hidden className="size-3" />,
    error: <TriangleAlert aria-hidden className="size-3" strokeWidth={2.5} />,
    cancelled: <Ban aria-hidden className="size-3" />,
  }[status];
  return (
    <span
      role="img"
      aria-label={CHECK_STATUS_LABEL[status]}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] ${CHECK_TONE[status]} ${
        status === "running" ? "pl-live-dot" : ""
      }`}
    >
      {icon}
    </span>
  );
}

export function CheckStatusText({ status }: { status: CheckStatus }) {
  const tone: Record<CheckStatus, string> = {
    pending: "text-ink-3",
    running: "text-accent",
    passed: "text-pass",
    failed: "text-fail",
    skipped: "text-ink-3",
    error: "text-warn",
    cancelled: "text-muted",
  };
  return <span className={`font-medium ${tone[status]}`}>{CHECK_STATUS_LABEL[status]}</span>;
}
