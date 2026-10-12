// Shared domain types. Imported by the web app, the worker, and tests.
// Kept free of runtime dependencies so it can run under Node type-stripping.

export type RunStatus = "queued" | "running" | "completed";
export type Verdict = "passed" | "failed" | "incomplete" | "cancelled";

export type CheckStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "skipped"
  | "error"
  | "cancelled";

/**
 * Why a check did not pass. Separates problems in the user's code from
 * problems in ProofLayer's own execution environment.
 */
export type FailureClass = "code" | "infrastructure" | "timeout" | "resource_limit";

export type StageKey =
  | "prepare"
  | "install"
  | "lint"
  | "typecheck"
  | "test"
  | "build"
  | "snapshot"
  | "collect"
  | "summarize";

export interface StageDefinition {
  key: StageKey;
  name: string;
  /** One-word label for the execution timeline. */
  short: string;
  /** Plain-language description shown to non-developers. */
  description: string;
  /** Required checks decide the verdict. Pipeline stages do not. */
  required: boolean;
  kind: "pipeline" | "check";
}

export interface CheckRecord {
  id: string;
  runId: string;
  key: StageKey;
  name: string;
  kind: "pipeline" | "check";
  required: boolean;
  position: number;
  status: CheckStatus;
  failureClass: FailureClass | null;
  command: string | null;
  exitCode: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  summary: string | null;
}

export interface EvidenceRecord {
  checkId: string;
  content: string;
  truncated: boolean;
  bytesTotal: number;
  sha256: string | null;
  updatedAt: string;
}

export interface RunRecord {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  repoFullName: string;
  repoProvider: "local" | "github";
  repoUrl: string | null;
  branch: string;
  commitSha: string;
  commitMessage: string | null;
  commitAuthor: string | null;
  commitDate: string | null;
  status: RunStatus;
  verdict: Verdict | null;
  verdictReason: string | null;
  cancelRequested: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  sample: boolean;
  /** A NeverBreak repair attempt, on a neverbreak/* branch. */
  isRepair: boolean;
}

export interface RunEvent {
  id: number;
  runId: string;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface AiExplanationContent {
  whatFailed: string;
  likelyCause: string;
  evidence: string[];
  inspect: string[];
  nextSteps: string[];
  confidence: "low" | "medium" | "high";
}

export interface AiExplanation {
  id: string;
  runId: string;
  checkId: string;
  status: "ok" | "error";
  model: string | null;
  content: AiExplanationContent | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface RepoCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface RepoBranch {
  name: string;
  headSha: string;
}

export interface RunArtifact {
  id: string;
  runId: string;
  checkId: string;
  kind: "screenshot";
  mime: string;
  bytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  pageUrl: string | null;
  label: string | null;
  capturedAt: string;
  /** Measured in the live page at capture time. Null for runs recorded before this existed. */
  annotations: SnapshotAnnotations | null;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where values from failing assertions appear in the rendered page. Found by
 * searching the real DOM text in Chromium at capture time; never inferred.
 */
export interface SnapshotAnnotations {
  /** Union of the visible content, used to frame the screenshot. */
  content: Box | null;
  /** Set when this screenshot is one frame of a scripted browser journey. */
  frame?: { journey: string; journeyName: string; step: number; label: string; primary?: boolean; /** Device pixels per CSS pixel. */ scale?: number };
  /** Set on a journey's final frame: what the journey expected to see, and what it saw. */
  journey?: { id: string; name: string; ok: boolean; expected: string; actual: string | null };
  matches: Array<{
    value: string;
    role: "expected" | "received";
    test: string;
    found: boolean;
    boxes: Box[];
    /** Text of the smallest element containing the value, as rendered. */
    text: string | null;
  }>;
}
