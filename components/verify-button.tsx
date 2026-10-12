"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "./ui.tsx";

/** Queues a real run for one commit and opens its workspace. */
export function VerifyButton({
  project,
  branch,
  sha,
  label = "Run verification",
  variant = "primary",
  size = "md",
  tour = false,
}: {
  project: string;
  branch: string;
  sha: string;
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  /** Open the run with the walkthrough strip. */
  tour?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  async function go() {
    setState("busy");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, branch, sha }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? "Could not start verification.");
      router.push(`/runs/${body.runId}${tour ? "?tour=1" : ""}`);
    } catch (e) {
      setState((e as Error).message);
    }
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant={variant} size={size} onClick={go} disabled={state === "busy"}>
        <Play className="size-3.5" aria-hidden />
        {state === "busy" ? "Starting…" : label}
      </Button>
      {state !== "idle" && state !== "busy" ? (
        <span role="alert" className="text-xs text-fail">
          {state}
        </span>
      ) : null}
    </span>
  );
}
