"use client";

import type { ComponentType, SVGProps } from "react";
import { AppWindow, Bot, Boxes, FlaskConical, ShieldCheck, Sparkles, Wrench, ScanSearch, Check, X } from "lucide-react";
import type { NodeStatus, StoryState } from "@/lib/shared/showcase.ts";

// NeverBreak's evidence network: the change flowing through the sandbox and the
// browser into the journeys it protects. Every node's state is a recorded
// check or journey result at this moment of the story; nothing animates on a
// timer of its own except the "working" pulse on a step that has really started.

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
interface GNode {
  id: string;
  x: number;
  y: number;
  label: string;
  icon: Icon;
  status: NodeStatus;
  accent?: "coral";
}

function agg(list: NodeStatus[]): NodeStatus {
  if (!list.length) return "idle";
  if (list.includes("fail")) return "fail";
  if (list.includes("checking")) return "checking";
  if (list.every((s) => s === "pass")) return "pass";
  if (list.some((s) => s === "pass") && list.includes("idle")) return "checking";
  if (list.every((s) => s === "idle")) return "idle";
  return "unchecked";
}

const COLOR: Record<NodeStatus, { top: string; rim: string; glow: string; text: string }> = {
  idle: { top: "#2a2c3a", rim: "#3b3e52", glow: "rgba(117,92,255,0.10)", text: "#8b8fa3" },
  unchecked: { top: "#2a2c3a", rim: "#4a4d61", glow: "rgba(161,165,181,0.10)", text: "#8b8fa3" },
  checking: { top: "#5a45f0", rim: "#9d8bff", glow: "rgba(117,92,255,0.55)", text: "#e6e1ff" },
  pass: { top: "#1f8f5c", rim: "#4fd893", glow: "rgba(61,214,140,0.35)", text: "#c9f5df" },
  fail: { top: "#b8322a", rim: "#ff7d72", glow: "rgba(255,107,94,0.5)", text: "#ffd9d5" },
};

export function EvidenceNetwork({ state }: { state: StoryState }) {
  const live = (keys: string[]) => state.checks.filter((c) => keys.includes(c.key)).map((c) => c.live);
  const started = state.checks.some((c) => c.live !== "idle");
  const protectedNodes = state.nodes.filter((n) => n.origin === "protected").map((n) => n.status);
  const newNodes = state.nodes.filter((n) => n.origin === "new").map((n) => n.status);
  const repairing = Boolean(state.attempt);
  const verdict: NodeStatus =
    state.phase === "done" ? (state.final?.tone === "pass" ? "pass" : state.final?.tone === "warn" ? "unchecked" : "fail") : state.phase === "regression" ? "fail" : started ? "idle" : "idle";

  const nodes: GNode[] = [
    { id: "change", x: 34, y: 100, label: repairing ? `Repair ${state.attempt!.n}` : "Prepared change", icon: repairing ? Wrench : Bot, status: state.phase === "intro" ? (state.scene === 1 ? "checking" : "pass") : started ? "pass" : "idle", accent: "coral" },
    { id: "code", x: 104, y: 52, label: "Code checks", icon: Boxes, status: agg(live(["install", "lint", "typecheck"])) },
    { id: "tests", x: 104, y: 148, label: "Tests", icon: FlaskConical, status: agg(live(["test"])) },
    { id: "build", x: 172, y: 52, label: "Build", icon: AppWindow, status: agg(live(["build"])) },
    { id: "browser", x: 172, y: 148, label: "Browser", icon: ScanSearch, status: agg(live(["snapshot"])) },
    { id: "protected", x: 240, y: 52, label: "Protected", icon: ShieldCheck, status: state.phase === "intro" && state.scene === 2 ? "pass" : agg(protectedNodes) },
    { id: "new", x: 240, y: 148, label: "New feature", icon: Sparkles, status: agg(newNodes), accent: "coral" },
    { id: "verdict", x: 306, y: 100, label: state.phase === "done" ? (verdict === "pass" ? "Verified" : verdict === "fail" ? "Stopped" : "Rolled back") : state.phase === "regression" ? "Caught" : "Verdict", icon: verdict === "pass" ? Check : verdict === "fail" ? X : ShieldCheck, status: verdict },
  ];
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges: [string, string][] = [
    ["change", "code"],
    ["change", "tests"],
    ["code", "build"],
    ["tests", "protected"],
    ["tests", "new"],
    ["build", "browser"],
    ["browser", "protected"],
    ["browser", "new"],
    ["protected", "verdict"],
    ["new", "verdict"],
  ];

  return (
    <figure className="relative overflow-hidden rounded-2xl border border-accent/15 bg-[#0d0e14] px-2 pb-1 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" aria-label="How this change is being checked">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(157,139,255,0.35)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-40 w-56 rotate-12 bg-[linear-gradient(120deg,rgba(117,92,255,0.25),transparent_70%)] blur-2xl" />
      <svg viewBox="0 0 340 200" className="relative block h-auto w-full overflow-visible" role="img" aria-hidden>
        <defs>
          <radialGradient id="nb-floor" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(117,92,255,0.22)" />
            <stop offset="100%" stopColor="rgba(117,92,255,0)" />
          </radialGradient>
        </defs>
        <ellipse cx="170" cy="100" rx="168" ry="92" fill="url(#nb-floor)" />
        {edges.map(([a, b]) => {
          const s = by[a];
          const t = by[b];
          const flowing = t.status === "checking" || (s.status === "checking" && t.status === "idle");
          const done = s.status !== "idle" && t.status !== "idle" && t.status !== "checking";
          const stroke = done ? (t.status === "fail" ? "rgba(255,107,94,0.75)" : t.status === "pass" ? "rgba(79,216,147,0.55)" : "rgba(161,165,181,0.4)") : "rgba(117,92,255,0.22)";
          const mx = (s.x + t.x) / 2;
          const d = `M ${s.x} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${t.x} ${t.y}`;
          return (
            <g key={`${a}-${b}`}>
              <path d={d} fill="none" stroke={stroke} strokeWidth={1.6} style={{ transition: "stroke 300ms" }} />
              {flowing ? <path d={d} fill="none" stroke="#a594ff" strokeWidth={2} className="nb-flow" strokeLinecap="round" /> : null}
            </g>
          );
        })}
        {nodes.map((n) => (
          <Puck key={n.id} n={n} />
        ))}
      </svg>
      <figcaption className="sr-only">
        {nodes.map((n) => `${n.label}: ${n.status}`).join(", ")}
      </figcaption>
    </figure>
  );
}

function Puck({ n }: { n: GNode }) {
  const c = COLOR[n.status];
  const coralIdle = n.accent === "coral" && (n.status === "idle" || n.status === "pass") && n.id === "change";
  const rim = coralIdle ? "#ff8a66" : c.rim;
  const top = coralIdle ? "#c4502f" : c.top;
  const I = n.icon;
  return (
    <g transform={`translate(${n.x} ${n.y})`}>
      <ellipse cx={0} cy={15} rx={23} ry={7} fill={c.glow} style={{ transition: "fill 300ms" }} />
      {n.status === "checking" ? <circle r={21} fill="none" stroke="#9d8bff" strokeWidth={1.5} className="nb-pulse" /> : null}
      <ellipse cx={0} cy={7} rx={18} ry={7} fill="#15161d" stroke={rim} strokeOpacity={0.5} />
      <circle r={16} fill={top} stroke={rim} strokeWidth={1.4} style={{ transition: "fill 300ms, stroke 300ms" }} />
      <ellipse cx={0} cy={-6} rx={10} ry={5} fill="rgba(255,255,255,0.14)" />
      <I x={-7} y={-7} width={14} height={14} color="#ffffff" strokeWidth={2.2} />
      <text y={36} textAnchor="middle" fontSize={10} fontWeight={500} fill={c.text} style={{ transition: "fill 300ms" }}>
        {n.label}
      </text>
    </g>
  );
}
