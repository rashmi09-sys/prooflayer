// The NeverBreak showcase, as data.
//
// ShowcaseData is built on the server from recorded runs only. The
// interface never animates anything that didn't happen: storyAt() turns that
// data plus a point in time into what is on screen. In live mode the time is
// now; in replay mode a virtual clock is mapped onto the recorded timestamps
// (compressed, and labelled as a replay).

import type { CheckStatus, Verdict } from "./types.ts";
import type { FlowState, NewCheck } from "./flows.ts";

export interface FrameLite {
  id: string;
  url: string;
  label: string;
  journey: string;
  journeyName: string;
  step: number;
  last: boolean;
  ok: boolean | null;
  expected: string | null;
  actual: string | null;
  primary: boolean;
  /** Where the failing value was found on this frame (CSS px of the page), if anywhere. */
  highlight: { x: number; y: number; width: number; height: number; text: string | null } | null;
  /** Page viewport in CSS px. */
  viewport: { width: number; height: number };
}

export interface FlowLite {
  id: string;
  name: string;
  kind: "test" | "page" | "journey";
  state: FlowState;
  detail: string;
  expected: string | null;
  actual: string | null;
}

export interface CheckLite {
  key: string;
  name: string;
  status: CheckStatus;
  startedAt: string | null;
  finishedAt: string | null;
  command: string | null;
  exitCode: number | null;
}

export interface RunLite {
  id: string;
  sha: string;
  message: string | null;
  status: "queued" | "running" | "completed";
  verdict: Verdict | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  checks: CheckLite[];
  frames: FrameLite[];
  flows: FlowLite[];
  newChecks: NewCheck[];
  /** Interactive preview of this run's verified build, if it kept one. */
  preview: string | null;
}

export interface AttemptLite {
  n: number;
  strategy: "prepared-fix" | "restore-source" | "roll-back";
  files: string[];
  branch: string;
  commit: string;
  sourceRef: string | null;
  run: RunLite | null;
}

export interface ShowcaseData {
  project: { slug: string; name: string };
  request: string | null;
  change: { sha: string; message: string | null; author: string | null; files: Array<{ path: string; additions: number; deletions: number }> };
  baseline: RunLite | null;
  source: RunLite | null;
  repair: {
    id: string;
    status: "running" | "succeeded" | "failed" | "stopped";
    outcome: "repaired" | "rolled-back" | null;
    summary: string | null;
    createdAt: string;
    finishedAt: string | null;
    attempts: AttemptLite[];
  } | null;
  /** Whether a repair can be started for the source run right now. */
  repairAvailable: boolean;
  /** Set when these runs were imported from a recorded demonstration package, not run on this machine. */
  recorded: { recordedAt: string; exportedAt: string; recordedIn: string } | null;
  /** A worker is online, so live checks are possible (operator only). */
  workerOnline: boolean;
  generatedAt: string;
}

export type Scene = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const SCENES: Array<{ n: Scene; title: string }> = [
  { n: 1, title: "The request" },
  { n: 2, title: "What's protected" },
  { n: 3, title: "Checking" },
  { n: 4, title: "Regression" },
  { n: 5, title: "Repair" },
  { n: 6, title: "Verification" },
  { n: 7, title: "Proof" },
];

export type NodeStatus = "idle" | "checking" | "pass" | "fail" | "unchecked";

export interface StoryNode {
  id: string;
  name: string;
  /** Verified on the baseline run, or new in this change. */
  origin: "protected" | "new";
  status: NodeStatus;
}

export interface FeedItem {
  id: string;
  at: number;
  tone: "info" | "live" | "pass" | "fail" | "warn";
  text: string;
  evidence?: string;
}

export interface StoryState {
  scene: Scene;
  /** The run whose evidence is on screen. */
  focusRun: RunLite | null;
  phase: "intro" | "checking" | "regression" | "repairing" | "verifying" | "done" | "idle";
  nodes: StoryNode[];
  feed: FeedItem[];
  checks: Array<CheckLite & { live: NodeStatus }>;
  frame: FrameLite | null;
  /** 0..1 progress through the focus run, from its recorded timestamps. */
  progress: number;
  regression: { flow: FlowLite; frame: FrameLite | null } | null;
  attempt: AttemptLite | null;
  final: { tone: "pass" | "fail" | "warn"; title: string; sub: string } | null;
}

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

function checkStatusAt(c: CheckLite, t: number): NodeStatus {
  const s = ms(c.startedAt);
  const f = ms(c.finishedAt);
  if (f !== null && f <= t) return c.status === "passed" ? "pass" : c.status === "failed" || c.status === "error" ? "fail" : "unchecked";
  if (s !== null && s <= t) return "checking";
  return "idle";
}

/** When each flow's result became known in a run: the finish of the checks that decide it. */
function flowNode(run: RunLite, flow: FlowLite, t: number): NodeStatus {
  const keys = flow.kind === "test" ? ["test", ...(run.frames.length ? ["snapshot"] : [])] : ["snapshot"];
  const cs = run.checks.filter((c) => keys.includes(c.key));
  const states = cs.map((c) => checkStatusAt(c, t));
  if (!cs.length || states.every((s) => s === "idle")) return run.status === "completed" && !cs.length ? toNode(flow.state) : "idle";
  if (states.some((s) => s === "checking" || s === "idle")) return "checking";
  return toNode(flow.state);
}

function toNode(s: FlowState): NodeStatus {
  return s === "passed" ? "pass" : s === "failed" || s === "missing" ? "fail" : s === "pending" ? "checking" : "unchecked";
}

/** The frame on screen at time t: frames are spread across the browser step. */
function frameAt(run: RunLite, t: number): FrameLite | null {
  if (!run.frames.length) return null;
  const snap = run.checks.find((c) => c.key === "snapshot");
  const s = ms(snap?.startedAt ?? null);
  const f = ms(snap?.finishedAt ?? null);
  if (s === null || t < s) return null;
  if (f === null || t >= f) return run.frames.find((x) => x.primary) ?? run.frames[run.frames.length - 1];
  const i = Math.min(run.frames.length - 1, Math.floor(((t - s) / Math.max(1, f - s)) * run.frames.length));
  return run.frames[i];
}

function progressOf(run: RunLite, t: number): number {
  const s = ms(run.startedAt);
  const f = ms(run.finishedAt);
  if (s === null || t < s) return 0;
  if (f !== null && t >= f) return 1;
  const done = run.checks.filter((c) => c.finishedAt && ms(c.finishedAt)! <= t).length;
  return Math.min(0.98, done / Math.max(1, run.checks.length));
}

export function finalOf(d: ShowcaseData): StoryState["final"] {
  const src = d.source;
  if (!src || src.status !== "completed") return null;
  if (src.verdict === "passed") return { tone: "pass", title: "Changes verified. Existing journeys protected.", sub: "Every protected flow passed on this change." };
  const r = d.repair;
  if (!r) return { tone: "fail", title: "Regression caught before release.", sub: d.repairAvailable ? "A safe repair can be attempted." : "The previous working version is untouched." };
  if (r.status === "running") return null;
  if (r.status === "succeeded" && r.outcome === "repaired") {
    const last = r.attempts.find((a) => a.run?.verdict === "passed")?.run;
    const feature = last?.newChecks.filter((c) => c.ok).length ?? 0;
    return {
      tone: "pass",
      title: "Changes verified. Existing journeys protected.",
      sub: `The repair kept the new feature: every protected flow and ${feature} new ${feature === 1 ? "check" : "checks"} passed on an isolated branch.`,
    };
  }
  if (r.status === "succeeded") return { tone: "warn", title: "Rolled back. Previous working version preserved.", sub: "Existing journeys work again, but the change's feature is not included." };
  return { tone: "fail", title: "Repair unsuccessful. Previous working version preserved.", sub: r.summary ?? "Stopped after the allowed attempts." };
}

/** Nodes: flows verified on the baseline, plus the change's new checks. */
function nodesFor(d: ShowcaseData, run: RunLite | null, t: number | null): StoryNode[] {
  const base = d.baseline?.flows ?? [];
  const nodes: StoryNode[] = (run?.flows ?? base).map((f) => {
    const verified = base.some((b) => b.id === f.id && b.state === "passed");
    return { id: f.id, name: f.name, origin: verified ? "protected" : "new", status: run && t !== null ? flowNode(run, f, t) : "idle" };
  });
  const fresh = d.source?.newChecks ?? [];
  for (const c of fresh) {
    if (c.kind !== "journey" && fresh.some((x) => x.kind === "journey")) continue; // one node per feature: prefer the browser journey
    const current = run?.newChecks.find((x) => x.key === c.key);
    const snap = run?.checks.find((x) => x.key === (c.kind === "journey" ? "snapshot" : "test"));
    const st: NodeStatus = !run || t === null || !snap ? "idle" : checkStatusAt(snap, t) === "pass" || checkStatusAt(snap, t) === "fail" ? (current ? (current.ok ? "pass" : "fail") : "unchecked") : checkStatusAt(snap, t) === "checking" ? "checking" : "idle";
    nodes.push({ id: c.key, name: c.kind === "journey" ? "Place a scheduled order" : c.name, origin: "new", status: st });
  }
  return nodes;
}

function feedUntil(d: ShowcaseData, t: number): FeedItem[] {
  const items: FeedItem[] = [];
  const add = (at: number | null, item: Omit<FeedItem, "at">) => at !== null && at <= t && items.push({ ...item, at });
  const src = d.source;
  if (src) {
    add(ms(src.startedAt), { id: "start", tone: "live", text: "Checking that existing orders still work.", evidence: src.id });
    const test = src.checks.find((c) => c.key === "test");
    const failingTest = src.flows.find((f) => f.kind === "test" && f.state === "failed");
    add(ms(test?.finishedAt ?? null), test?.status === "failed" ? { id: "tests", tone: "fail", text: `${failingTest?.name ?? "A protected flow"} failed in the tests.`, evidence: "test" } : { id: "tests", tone: "pass", text: "The tests for every protected flow passed." });
    const snap = src.checks.find((c) => c.key === "snapshot");
    for (const fr of src.frames.filter((f) => f.last)) {
      add(ms(snap?.finishedAt ?? null), fr.ok ? { id: `j-${fr.journey}`, tone: "pass", text: `In the browser, ${fr.journeyName.toLowerCase()} reached “${fr.expected}”.`, evidence: fr.id } : { id: `j-${fr.journey}`, tone: "fail", text: `In the browser, ${fr.journeyName.toLowerCase()} ended on “${fr.actual}”.`, evidence: fr.id });
    }
    if (src.verdict === "failed") {
      const fresh = src.newChecks.length && src.newChecks.every((c) => c.ok);
      add(ms(src.finishedAt), { id: "verdict", tone: "fail", text: fresh ? "Scheduled delivery works. Regular checkout broke." : "A protected flow broke." });
    } else if (src.verdict === "passed") add(ms(src.finishedAt), { id: "verdict", tone: "pass", text: "Every protected flow still works." });
  }
  const r = d.repair;
  if (r) {
    const at = ms(r.createdAt);
    add(at, { id: "investigate", tone: "info", text: `Looking at what changed: ${d.change.files.length} files since the last working version.` });
    for (const a of r.attempts) {
      const when = ms(a.run?.createdAt ?? null) ?? at;
      add(when, {
        id: `cand-${a.n}`,
        tone: "info",
        text:
          a.strategy === "prepared-fix"
            ? `Repair ${a.n}: the prepared fix, written in advance, not generated.`
            : a.strategy === "roll-back"
              ? `Repair ${a.n}: roll back everything the change touched.`
              : `Repair ${a.n}: restore the app code the change touched.`,
      });
      add(when, { id: `branch-${a.n}`, tone: "info", text: "Applied on a separate copy, never on the live app.", evidence: a.commit.slice(0, 7) });
      add(ms(a.run?.startedAt ?? null), { id: `test-${a.n}`, tone: "live", text: "Testing the repair: every protected flow and the new feature.", evidence: a.run?.id });
      if (a.run?.status === "completed") {
        const kept = a.run.newChecks.length > 0 && a.run.newChecks.every((c) => c.ok);
        add(
          ms(a.run.finishedAt),
          a.run.verdict === "passed"
            ? { id: `res-${a.n}`, tone: "pass", text: kept ? "Both delivery options verified." : "Protected flows pass again.", evidence: a.run.id }
            : { id: `res-${a.n}`, tone: "fail", text: `Attempt ${a.n} didn't fix it.`, evidence: a.run.id },
        );
      }
    }
  }
  return items.sort((x, y) => x.at - y.at);
}

/** What is on screen at real time t (milliseconds), with an optional scene override for the intro. */
export function storyAt(d: ShowcaseData, t: number, intro?: 1 | 2): StoryState {
  const src = d.source;
  const r = d.repair;
  const active = r?.attempts.filter((a) => a.run && ms(a.run.createdAt)! <= t).pop() ?? null;
  const inRepair = r && ms(r.createdAt)! <= t;
  const focusRun = inRepair && active?.run ? active.run : src;
  // Until a repair attempt actually starts, the source run's results stay on screen.
  const started = inRepair && active?.run?.startedAt && ms(active.run.startedAt)! <= t;
  const nodeRun = started ? active!.run : src;
  const nodes = intro === 1 ? [] : nodesFor(d, intro === 2 ? null : nodeRun, intro ? null : t);
  if (intro === 2) for (const n of nodes) n.status = n.origin === "protected" ? "pass" : "idle";

  let scene: Scene;
  let phase: StoryState["phase"] = "checking";
  const srcDone = src?.finishedAt && ms(src.finishedAt)! <= t;
  if (intro) {
    scene = intro;
    phase = "intro";
  } else if (!src?.startedAt || ms(src.startedAt)! > t) {
    scene = 3;
    phase = "idle";
  } else if (!srcDone) {
    scene = 3;
  } else if (src.verdict !== "failed") {
    scene = 7;
    phase = "done";
  } else if (!inRepair) {
    scene = 4;
    phase = "regression";
  } else if (!active?.run?.startedAt || ms(active.run.startedAt)! > t) {
    scene = 5;
    phase = "repairing";
  } else if (!active.run.finishedAt || ms(active.run.finishedAt)! > t || r!.status === "running") {
    scene = 6;
    phase = "verifying";
  } else {
    scene = 7;
    phase = "done";
  }

  const failing = src?.flows.find((f) => f.state === "failed") ?? null;
  const failFrame = src?.frames.find((f) => f.primary) ?? null;
  const showRegression = src?.verdict === "failed" && srcDone && !intro && failing;

  return {
    scene,
    focusRun: focusRun ?? null,
    phase,
    nodes,
    feed: intro ? [] : feedUntil(d, t),
    checks: (focusRun?.checks ?? []).map((c) => ({ ...c, live: intro ? "idle" : checkStatusAt(c, t) })),
    frame:
      intro === 1
        ? (src?.frames.find((f) => f.journey === "scheduled-checkout" && /schedul/i.test(f.label)) ?? null)
        : intro === 2
          ? null
          : started
            ? frameAt(active!.run!, t)
            : src
              ? frameAt(src, t)
              : null,
    progress: intro || !focusRun ? 0 : progressOf(focusRun, t),
    regression: showRegression ? { flow: failing!, frame: failFrame } : null,
    attempt: inRepair ? active : null,
    final: scene === 7 ? finalOf(d) : null,
  };
}

// ------------------------------------------------------------ replay clock

export interface Segment {
  /** Virtual seconds this segment lasts on screen. */
  dur: number;
  scene: Scene;
  intro?: 1 | 2;
  /** Real time at the start and end of the segment (ms). Equal for a pause. */
  from: number;
  to: number;
}

export const REPLAY_SPEED = 4;

/** Maps a replay onto the recorded timestamps: intros, then each run at REPLAY_SPEED×, with short pauses on key moments. */
export interface ReplayPace {
  /** Recorded seconds per replayed second. */
  speed: number;
  /** Seconds for each intro scene and for each held moment. */
  intro: number;
  pause: number;
}
export const DEFAULT_PACE: ReplayPace = { speed: REPLAY_SPEED, intro: 4.5, pause: 5 };

export function replayTimeline(d: ShowcaseData, pace: ReplayPace = DEFAULT_PACE): Segment[] {
  const src = d.source;
  if (!src?.startedAt || !src.finishedAt) return [];
  const s = ms(src.startedAt)!;
  const f = ms(src.finishedAt)!;
  const segs: Segment[] = [
    { dur: pace.intro, scene: 1, intro: 1, from: s - 1, to: s - 1 },
    { dur: pace.intro, scene: 2, intro: 2, from: s - 1, to: s - 1 },
    { dur: (f - s) / 1000 / pace.speed, scene: 3, from: s, to: f },
    { dur: pace.pause, scene: 4, from: f, to: f },
  ];
  const r = d.repair;
  if (r) {
    for (const a of r.attempts) {
      if (!a.run?.startedAt || !a.run.finishedAt) continue;
      const created = ms(a.run.createdAt)!;
      const rs = ms(a.run.startedAt)!;
      const rf = ms(a.run.finishedAt)!;
      segs.push({ dur: pace.pause, scene: 5, from: created, to: Math.max(created, rs - 1) });
      segs.push({ dur: (rf - rs) / 1000 / pace.speed, scene: 6, from: rs, to: rf });
    }
    const end = ms(r.finishedAt) ?? Math.max(...r.attempts.map((a) => ms(a.run?.finishedAt ?? null) ?? 0));
    segs.push({ dur: 1, scene: 7, from: end + 1, to: end + 1 });
  } else {
    segs.push({ dur: 1, scene: 7, from: f + 1, to: f + 1 });
  }
  return segs;
}

export function replayDuration(segs: Segment[]): number {
  return segs.reduce((n, x) => n + x.dur, 0);
}

/** Real time (and intro scene) for a virtual time in seconds. */
export function realTimeAt(segs: Segment[], v: number): { t: number; intro?: 1 | 2; segment: number } {
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (v < acc + g.dur || i === segs.length - 1) {
      const k = g.dur ? Math.min(1, Math.max(0, (v - acc) / g.dur)) : 1;
      return { t: g.from + (g.to - g.from) * k, intro: g.intro, segment: i };
    }
    acc += g.dur;
  }
  return { t: Date.now(), segment: 0 };
}

/** Virtual time at which a scene first appears. */
export function sceneStart(segs: Segment[], scene: Scene): number | null {
  let acc = 0;
  for (const g of segs) {
    if (g.scene === scene) return acc;
    acc += g.dur;
  }
  return null;
}

/**
 * The plain-language result of the scheduled-delivery story, only when the
 * evidence supports it: the run that ends the story (the change itself if it
 * passed, otherwise the repair that kept the feature) must show regular and
 * scheduled checkout both reaching their screens in Chromium, with every
 * protected flow and new check passing. Otherwise, the usual outcome title.
 */
export function outcomeLine(d: ShowcaseData): { tone: "pass" | "fail" | "warn"; title: string; proven: boolean } | null {
  const f = finalOf(d);
  if (!f) return null;
  const end = d.source?.verdict === "passed" ? d.source : d.repair?.outcome === "repaired" ? (d.repair.attempts.find((a) => a.run?.verdict === "passed")?.run ?? null) : null;
  if (end) {
    const reached = (journey: string) => end.frames.some((fr) => fr.last && fr.journey === journey && fr.ok === true);
    const proven = reached("regular-checkout") && reached("scheduled-checkout") && end.flows.every((x) => x.state === "passed") && end.newChecks.length > 0 && end.newChecks.every((c) => c.ok);
    if (proven) return { tone: "pass", title: "Scheduled delivery works. Regular checkout still works.", proven: true };
  }
  return { tone: f.tone, title: f.title, proven: false };
}
