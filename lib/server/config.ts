import path from "node:path";

// Server-only configuration. Nothing here is ever sent to the browser.

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Public read-only demo mode. Fails closed:
 * - PROOFLAYER_PUBLIC_DEMO=true  → public demo.
 * - PROOFLAYER_PUBLIC_DEMO=false → private (operator) mode. Build-time scripts
 *   set this explicitly to create the recorded data.
 * - unset → public demo on Vercel (VERCEL=1), private everywhere else.
 * - any other value → public demo.
 *
 * In public demo mode the server has no operator sign-in, no mutating API, no
 * worker, no git, no AI calls, and reads an immutable snapshot opened read-only.
 */
export function resolvePublicDemo(e: Record<string, string | undefined> = process.env): boolean {
  const v = e.PROOFLAYER_PUBLIC_DEMO?.trim().toLowerCase();
  if (v === "false") return false;
  if (v === undefined || v === "") return e.VERCEL === "1";
  return true;
}

const publicDemo = resolvePublicDemo();

/** The immutable snapshot the public demo reads: built by `npm run demo:snapshot`. */
export const SNAPSHOT_DIR = ".demo-snapshot";

function resolveDataDir(): string {
  const explicit = env("PROOFLAYER_DATA_DIR");
  if (explicit) return path.resolve(/*turbopackIgnore: true*/ explicit);
  return path.join(/*turbopackIgnore: true*/ process.cwd(), publicDemo ? SNAPSHOT_DIR : ".data");
}

export const config = {
  publicDemo,
  /** Database, artifacts and fixture repositories (private mode), or the read-only snapshot (public demo). */
  dataDir: resolveDataDir(),

  /** Shared access code for the single operator account. Ignored in the public demo. */
  accessCode: publicDemo ? undefined : env("PROOFLAYER_ACCESS_CODE"),
  /** HMAC key for session cookies. At least 32 characters. Ignored in the public demo. */
  sessionSecret: publicDemo ? undefined : env("PROOFLAYER_SESSION_SECRET"),
  operatorEmail: env("PROOFLAYER_OPERATOR_EMAIL") ?? "operator@prooflayer.local",

  anthropicApiKey: publicDemo ? undefined : env("ANTHROPIC_API_KEY"),
  anthropicModel: env("PROOFLAYER_ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
  anthropicBaseUrl: env("PROOFLAYER_ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com",

  /** Least-privilege token: fine-grained, read-only Contents + Metadata on one repo. */
  githubToken: publicDemo ? undefined : env("PROOFLAYER_GITHUB_TOKEN"),
  /** The single allowlisted GitHub repository, as "owner/name". */
  githubRepository: publicDemo ? undefined : env("PROOFLAYER_GITHUB_REPOSITORY"),

  runner: {
    image: env("PROOFLAYER_RUNNER_IMAGE") ?? "prooflayer-runner:node22",
    memory: env("PROOFLAYER_RUNNER_MEMORY") ?? "2g",
    cpus: env("PROOFLAYER_RUNNER_CPUS") ?? "2",
    pids: Number(env("PROOFLAYER_RUNNER_PIDS") ?? 512),
    installTimeoutMs: Number(env("PROOFLAYER_INSTALL_TIMEOUT_MS") ?? 240_000),
    checkTimeoutMs: Number(env("PROOFLAYER_CHECK_TIMEOUT_MS") ?? 180_000),
    /** Raw bytes captured per check before the process output is cut off. */
    maxCaptureBytes: Number(env("PROOFLAYER_MAX_CAPTURE_BYTES") ?? 4_000_000),
    /** Characters stored per check after redaction. */
    maxStoredChars: Number(env("PROOFLAYER_MAX_STORED_CHARS") ?? 64_000),
  },
} as const;

export function dbPath(): string {
  return path.join(config.dataDir, "prooflayer.db");
}

/** Values that must never appear in stored output. */
export function knownSecrets(): string[] {
  return [config.accessCode, config.sessionSecret, config.anthropicApiKey, config.githubToken].filter(
    (v): v is string => typeof v === "string",
  );
}
