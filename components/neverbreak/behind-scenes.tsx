"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Cpu } from "lucide-react";
import type { RunDetail } from "@/lib/server/run-detail.ts";
import { investigationSteps } from "@/lib/ui/investigation.ts";
import { StepRail } from "../workspace/step-rail.tsx";
import { Preview } from "../workspace/preview.tsx";
import { Inspector, type InspectorTab } from "../workspace/inspector.tsx";
import { Assistant } from "../workspace/assistant.tsx";

/**
 * Behind the scenes: everything a technical reviewer wants, kept out of the
 * product view until asked for. Sandbox steps, live output, the browser
 * capture, logs, exit codes, commit metadata, provenance, and the
 * deterministic assistant.
 */
export function BehindTheScenes({
  detail,
  now,
  readOnly,
  open,
  onOpenChange,
  onRefresh,
}: {
  detail: RunDetail;
  now: number;
  readOnly?: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRefresh: () => void;
}) {
  const steps = useMemo(() => investigationSteps(detail.checks), [detail.checks]);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [tab, setTab] = useState<InspectorTab>("logs");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const live = detail.run.status !== "completed";

  const toggleStep = useCallback((key: string, o?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const want = o ?? !next.has(key);
      if (want) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const openLog = useCallback(
    (key: string) => {
      onOpenChange(true);
      setInspectorOpen(true);
      setTab("logs");
      toggleStep(key, true);
      setTimeout(() => document.getElementById(`stage-${key}-panel`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 360);
    },
    [onOpenChange, toggleStep],
  );

  const selectStep = useCallback(
    (id: string) => {
      const s = steps.find((x) => x.id === id);
      const key = s?.checks.find((c) => c.status === "failed" || c.status === "error")?.key ?? s?.checks[0]?.key;
      if (key) openLog(key);
    },
    [steps, openLog],
  );

  const running = detail.checks.find((c) => c.status === "running");

  return (
    <section id="background" aria-labelledby="background-heading" className="scroll-mt-6 rounded-[24px] border border-line bg-surface-2">
      <h2 id="background-heading">
        <button type="button" aria-expanded={open} aria-controls="background-body" onClick={() => onOpenChange(!open)} className="flex w-full items-center gap-3 rounded-[24px] px-5 py-4 text-left sm:px-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-ink-2 shadow-sm">
            <Cpu className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">Behind the scenes</span>
            <span className="block truncate text-sm text-ink-3">
              {live ? (running ? `Now: ${running.name}${running.command ? ` · ${running.command}` : ""}` : "Waiting for the sandbox") : "Sandbox steps, logs, exit codes, browser capture and run metadata"}
            </span>
          </span>
          <ChevronDown className={`size-5 shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="background-body"
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.3, 0.7, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-4 pb-5 pt-5 sm:px-6">
              <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[232px_minmax(0,1fr)_340px] xl:items-start">
                <div className="min-w-0 xl:sticky xl:top-6">
                  <p className="mb-2 text-xs font-medium text-ink-3">Sandbox steps</p>
                  <StepRail steps={steps} now={now} onSelect={selectStep} />
                </div>
                <div className="flex min-w-0 flex-col gap-5">
                  <Preview detail={detail} steps={steps} now={now} reveal={false} />
                  <Inspector
                    detail={detail}
                    readOnly={readOnly}
                    open={inspectorOpen}
                    tab={tab}
                    expanded={expanded}
                    onOpenChange={setInspectorOpen}
                    onTab={setTab}
                    onToggleStep={toggleStep}
                    onRefresh={onRefresh}
                  />
                </div>
                <div className="min-w-0">
                  <Assistant detail={detail} onFocusPreview={() => document.getElementById("preview-heading")?.scrollIntoView({ behavior: "smooth", block: "start" })} onOpenLog={openLog} />
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
