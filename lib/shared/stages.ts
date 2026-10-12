import type { StageDefinition, StageKey } from "./types.ts";

/**
 * The verification pipeline, in execution order. The worker creates one
 * check row per stage when a run is claimed, so the UI can show pending
 * stages before they start without inventing progress.
 */
export const STAGES: StageDefinition[] = [
  {
    key: "prepare",
    short: "Prepare",
    name: "Prepare repository",
    description: "Export the exact commit into a clean, temporary workspace.",
    required: false,
    kind: "pipeline",
  },
  {
    key: "install",
    short: "Dependencies",
    name: "Resolve dependencies",
    description: "Install the locked dependency versions without running install scripts.",
    required: true,
    kind: "check",
  },
  {
    key: "lint",
    short: "Lint",
    name: "Lint",
    description: "Check the code against the project's lint rules.",
    required: true,
    kind: "check",
  },
  {
    key: "typecheck",
    short: "Types",
    name: "Type check",
    description: "Compile with TypeScript to catch type errors.",
    required: true,
    kind: "check",
  },
  {
    key: "test",
    short: "Tests",
    name: "Tests",
    description: "Run the project's automated tests.",
    required: true,
    kind: "check",
  },
  {
    key: "build",
    short: "Build",
    name: "Production build",
    description: "Build the app the way a deployment would.",
    required: true,
    kind: "check",
  },
  {
    key: "snapshot",
    short: "Snapshot",
    name: "Browser snapshot",
    description: "Serve the build inside the sandbox and capture the page in a real browser. Informational; it never affects the verdict.",
    required: false,
    kind: "pipeline",
  },
  {
    key: "collect",
    short: "Evidence",
    name: "Collect results",
    description: "Hash the captured output and keep the source lines behind each failure.",
    required: false,
    kind: "pipeline",
  },
  {
    key: "summarize",
    short: "Verdict",
    name: "Summarize verdict",
    description: "Decide the verdict from recorded exit codes only.",
    required: false,
    kind: "pipeline",
  },
];

export function stageByKey(key: StageKey): StageDefinition {
  const stage = STAGES.find((s) => s.key === key);
  if (!stage) throw new Error(`Unknown stage ${key}`);
  return stage;
}
