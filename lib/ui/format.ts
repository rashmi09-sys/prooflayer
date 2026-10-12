import type { CheckStatus, FailureClass, Verdict } from "../shared/types.ts";

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  return `${m} m ${Math.round(s % 60)} s`;
}

/**
 * A recorded moment, always in UTC and labelled so. Rendered on the server and
 * again in the browser, so it must not depend on either machine's time zone.
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(iso))} UTC`;
}

export function relativeTime(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return "never";
  const diff = Math.round((nowMs - new Date(iso).getTime()) / 1000);
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff} s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export const VERDICT_COPY: Record<Verdict, { label: string; meaning: string }> = {
  passed: { label: "Passed", meaning: "Every required check ran and exited successfully." },
  failed: { label: "Failed", meaning: "At least one required check ran and failed." },
  incomplete: { label: "Incomplete", meaning: "Verification could not finish, so there is no verdict on the code." },
  cancelled: { label: "Cancelled", meaning: "The run was stopped before it finished." },
};

export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  pending: "Waiting",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  skipped: "Not run",
  error: "Could not finish",
  cancelled: "Cancelled",
};

export const FAILURE_CLASS_LABEL: Record<FailureClass, string> = {
  code: "Code failure",
  infrastructure: "Environment error",
  timeout: "Time limit",
  resource_limit: "Resource limit",
};
