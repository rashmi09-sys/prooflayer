import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config, knownSecrets } from "./config.ts";
import { sanitize } from "../shared/redact.ts";
import type { RepoBranch, RepoCommit } from "../shared/types.ts";
import type { ProjectRecord } from "./store.ts";

const run = promisify(execFile);

export const SHA_RE = /^[0-9a-f]{40}$/;
const REF_RE = /^[0-9a-f]{7,40}$|^[A-Za-z0-9._/-]{1,200}$/;

export interface RepoInfo {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  webUrl: string | null;
  visibility: string;
  provider: "local" | "github";
  authenticated: boolean;
}

export class ProviderError extends Error {
  kind: "connection_required" | "not_found" | "upstream" | "forbidden";
  constructor(kind: ProviderError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface RepoProvider {
  info(): Promise<RepoInfo>;
  branches(): Promise<RepoBranch[]>;
  commits(branch: string, limit?: number): Promise<RepoCommit[]>;
  /** Resolve a branch name or SHA to a commit that exists in this repository. */
  resolve(ref: string): Promise<RepoCommit>;
  /** Write the commit's files into an empty directory. */
  exportTo(sha: string, dir: string): Promise<void>;
  /** Link to a file at a commit, when the repository is browsable. */
  fileUrl(sha: string, file: string, line?: number): string | null;
  /** Files changed between two commits, with unified patches where available. */
  diff(base: string, head: string): Promise<CommitDiff>;
  /** A text file's content at a commit; null if it does not exist there. */
  readFile(sha: string, file: string): Promise<string | null>;
  /**
   * NeverBreak repair: a new commit on top of `head` whose listed files are
   * restored to their content at `base`, published on a neverbreak/* branch.
   * Null when this provider cannot create commits.
   */
  createRestoreCommit?(input: RestoreCommitInput): Promise<string>;
  /**
   * Candidate patches prepared in advance for a commit: branches under
   * prepared-fixes/ whose single commit sits directly on top of it.
   */
  preparedFixes?(sha: string): Promise<PreparedFix[]>;
}

export interface PreparedFix {
  ref: string;
  sha: string;
  message: string;
  author: string;
  files: string[];
}

export interface RestoreCommitInput {
  head: string;
  base: string;
  paths: string[];
  message: string;
  branch: string;
}

const SAFE_PATH = (p: string) => p.length > 0 && p.length < 400 && !p.startsWith("-") && !p.startsWith("/") && !p.split("/").includes("..") && !/[\0\n]/.test(p);
const REPAIR_BRANCH_RE = /^neverbreak\/repair-[A-Za-z0-9_-]{4,40}-[12]$/;

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  /** Unified diff hunk text, sanitized. Null for binary or very large files. */
  patch: string | null;
}

export interface CommitDiff {
  base: string;
  head: string;
  files: DiffFile[];
  truncated: boolean;
}

const MAX_PATCH_CHARS = 12_000;
const SKIP_PATCH = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/;

export function providerFor(project: ProjectRecord): RepoProvider {
  // The public demo never runs git or calls GitHub: it reads the recorded repository in its snapshot.
  if (config.publicDemo) return new RecordedRepoProvider(project.connection.locator);
  return project.connection.provider === "local"
    ? new LocalGitProvider(project.connection.locator, project.connection.fullName)
    : new GitHubProvider(project.connection.locator);
}

// ------------------------------------------------------- recorded (public demo)

/** What the public demo snapshot records about a fixture repository (scripts/build-snapshot.ts). */
export interface RecordedRepo {
  fullName: string;
  defaultBranch: string;
  branches: RepoBranch[];
  /** Commits by full SHA. */
  commits: Record<string, RepoCommit>;
  /** Each branch's history, newest first, as full SHAs. */
  logs: Record<string, string[]>;
  /** "base..head" → the diff, for every ordered pair of recorded commits. */
  diffs: Record<string, CommitDiff>;
  /** "sha:path" → file content, for files changed by any recorded diff (null: absent at that commit). */
  files: Record<string, string | null>;
}

export const RECORDED_REPO_LOCATOR_RE = /^[a-z0-9-]{1,64}$/;

/**
 * A fixture repository as recorded in the public demo snapshot. Read-only by
 * construction: it cannot export source for execution, create commits or list
 * prepared fixes, and it only knows the commits and diffs that were recorded.
 */
export class RecordedRepoProvider implements RepoProvider {
  private repo: RecordedRepo;

  constructor(locator: string) {
    if (!RECORDED_REPO_LOCATOR_RE.test(locator)) throw new ProviderError("forbidden", "Repository is outside the allowlist.");
    const file = path.join(config.dataDir, "repos", `${locator}.json`);
    try {
      this.repo = JSON.parse(fs.readFileSync(file, "utf8")) as RecordedRepo;
    } catch {
      throw new ProviderError("connection_required", "This repository is not part of the public demo snapshot.");
    }
  }

  async info(): Promise<RepoInfo> {
    return { fullName: this.repo.fullName, description: "Recorded fixture repository (public demo snapshot).", defaultBranch: this.repo.defaultBranch, webUrl: null, visibility: "recorded", provider: "local", authenticated: false };
  }

  async branches(): Promise<RepoBranch[]> {
    return this.repo.branches;
  }

  async commits(branch: string, limit = 20): Promise<RepoCommit[]> {
    const log = this.repo.logs[branch];
    if (!log) throw new ProviderError("not_found", `Branch ${branch} does not exist.`);
    return log.slice(0, Math.min(limit, 100)).map((sha) => this.repo.commits[sha]).filter(Boolean);
  }

  async resolve(ref: string): Promise<RepoCommit> {
    if (!REF_RE.test(ref) || ref.startsWith("-")) throw new ProviderError("not_found", "Invalid ref.");
    const branch = this.repo.branches.find((b) => b.name === ref);
    const matches = branch ? [branch.headSha] : Object.keys(this.repo.commits).filter((sha) => /^[0-9a-f]{7,40}$/.test(ref) && sha.startsWith(ref));
    if (matches.length !== 1 || !this.repo.commits[matches[0]]) throw new ProviderError("not_found", `Commit ${ref} was not found in ${this.repo.fullName}.`);
    return this.repo.commits[matches[0]];
  }

  async exportTo(): Promise<void> {
    throw new ProviderError("forbidden", "The public demo cannot export source for execution.");
  }

  fileUrl(): string | null {
    return null;
  }

  async diff(base: string, head: string): Promise<CommitDiff> {
    if (!SHA_RE.test(base) || !SHA_RE.test(head)) throw new ProviderError("not_found", "Invalid commit SHA.");
    if (base === head) return { base, head, files: [], truncated: false };
    const d = this.repo.diffs[`${base}..${head}`];
    if (!d) throw new ProviderError("not_found", "This comparison is not part of the recorded demo.");
    return d;
  }

  async readFile(sha: string, file: string): Promise<string | null> {
    if (!SHA_RE.test(sha) || !SAFE_PATH(file)) return null;
    return this.repo.files[`${sha}:${file}`] ?? null;
  }
}

// ------------------------------------------------------------ local git

/** A git repository on the server's own disk, restricted to <dataDir>/repos. */
export class LocalGitProvider implements RepoProvider {
  private dir: string;
  private fullName: string;

  constructor(locator: string, fullName: string) {
    const root = path.join(config.dataDir, "repos");
    const dir = path.resolve(root, locator);
    if (!dir.startsWith(root + path.sep)) throw new ProviderError("forbidden", "Repository is outside the allowlist.");
    this.dir = dir;
    this.fullName = fullName;
  }

  private async git(args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
    if (!fs.existsSync(path.join(this.dir, ".git"))) {
      throw new ProviderError("connection_required", "The demo repository has not been created. Run `npm run setup`.");
    }
    const { stdout } = await run("git", ["-C", this.dir, ...args], { maxBuffer: 8 * 1024 * 1024, timeout: 20_000, env: env ?? process.env });
    return stdout;
  }

  async readFile(sha: string, file: string): Promise<string | null> {
    if (!SHA_RE.test(sha) || !SAFE_PATH(file)) return null;
    try {
      return await this.git(["show", `${sha}:${file}`]);
    } catch {
      return null;
    }
  }

  async preparedFixes(sha: string): Promise<PreparedFix[]> {
    if (!SHA_RE.test(sha)) return [];
    const out = await this.git(["for-each-ref", "--format=%(refname:short) %(objectname)", "refs/heads/prepared-fixes/"]).catch(() => "");
    const fixes: PreparedFix[] = [];
    for (const line of out.trim().split("\n").filter(Boolean)) {
      const [ref, tip] = line.split(" ");
      const parent = (await this.git(["rev-parse", `${tip}^`]).catch(() => "")).trim();
      if (parent !== sha) continue;
      const [c] = parseLog(await this.git(["log", "-1", "--format=%H%x1f%an%x1f%aI%x1f%s", tip, "--"]));
      const files = (await this.git(["diff", "--name-only", "--no-renames", sha, tip, "--"])).trim().split("\n").filter(Boolean);
      if (c && files.length && files.every(SAFE_PATH)) fixes.push({ ref, sha: tip, message: c.message, author: c.author, files });
    }
    return fixes;
  }

  async createRestoreCommit({ head, base, paths, message, branch }: RestoreCommitInput): Promise<string> {
    if (!SHA_RE.test(head) || !SHA_RE.test(base)) throw new ProviderError("not_found", "Invalid commit SHA.");
    if (!REPAIR_BRANCH_RE.test(branch)) throw new ProviderError("forbidden", "Repairs may only write neverbreak/repair-* branches.");
    if (!paths.length || !paths.every(SAFE_PATH)) throw new ProviderError("forbidden", "Invalid repair paths.");
    // A private index, so the repository's own index and working tree are never touched.
    const index = path.join(config.dataDir, "work", `nb-index-${process.pid}-${Date.now()}`);
    fs.mkdirSync(path.dirname(index), { recursive: true });
    const env = {
      ...process.env,
      GIT_INDEX_FILE: index,
      GIT_AUTHOR_NAME: "NeverBreak",
      GIT_AUTHOR_EMAIL: "neverbreak@prooflayer.local",
      GIT_COMMITTER_NAME: "NeverBreak",
      GIT_COMMITTER_EMAIL: "neverbreak@prooflayer.local",
    };
    try {
      await this.git(["read-tree", head], env);
      for (const p of paths) {
        const entry = (await this.git(["ls-tree", base, "--", p], env)).trim();
        if (entry) {
          const [meta] = entry.split("\t");
          const [mode, , blob] = meta.split(" ");
          await this.git(["update-index", "--add", "--cacheinfo", `${mode},${blob},${p}`], env);
        } else {
          await this.git(["update-index", "--force-remove", "--", p], env);
        }
      }
      const tree = (await this.git(["write-tree"], env)).trim();
      const commit = (await this.git(["commit-tree", tree, "-p", head, "-m", message], env)).trim();
      if (!SHA_RE.test(commit)) throw new Error("commit-tree returned no SHA");
      await this.git(["update-ref", `refs/heads/${branch}`, commit], env);
      return commit;
    } finally {
      fs.rmSync(index, { force: true });
    }
  }

  async info(): Promise<RepoInfo> {
    const head = (await this.git(["symbolic-ref", "--short", "HEAD"])).trim();
    return {
      fullName: this.fullName,
      description: "Local fixture repository on the ProofLayer server.",
      defaultBranch: head,
      webUrl: null,
      visibility: "local",
      provider: "local",
      authenticated: true,
    };
  }

  async branches(): Promise<RepoBranch[]> {
    const out = await this.git(["for-each-ref", "--format=%(refname:short) %(objectname)", "refs/heads"]);
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [name, headSha] = l.split(" ");
        return { name, headSha };
      });
  }

  async commits(branch: string, limit = 20): Promise<RepoCommit[]> {
    const names = (await this.branches()).map((b) => b.name);
    if (!names.includes(branch)) throw new ProviderError("not_found", `Branch ${branch} does not exist.`);
    const out = await this.git([
      "log",
      `--max-count=${Math.min(limit, 100)}`,
      "--format=%H%x1f%an%x1f%aI%x1f%s",
      `refs/heads/${branch}`,
    ]);
    return parseLog(out);
  }

  async resolve(ref: string): Promise<RepoCommit> {
    if (!REF_RE.test(ref) || ref.startsWith("-")) throw new ProviderError("not_found", "Invalid ref.");
    try {
      const out = await this.git(["log", "-1", "--format=%H%x1f%an%x1f%aI%x1f%s", `${ref}^{commit}`, "--"]);
      const [c] = parseLog(out);
      if (!c) throw new Error("empty");
      return c;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("not_found", `Commit ${ref} was not found in ${this.fullName}.`);
    }
  }

  async exportTo(sha: string, dir: string): Promise<void> {
    if (!SHA_RE.test(sha)) throw new ProviderError("not_found", "Invalid commit SHA.");
    fs.mkdirSync(dir, { recursive: true });
    const archive = path.join(dir, "..", `${path.basename(dir)}.tar`);
    await this.git(["archive", "--format=tar", `--output=${archive}`, sha]);
    await run("tar", ["-xf", archive, "-C", dir, "--no-same-owner"], { timeout: 60_000 });
    fs.rmSync(archive, { force: true });
  }

  fileUrl(): string | null {
    return null;
  }

  async diff(base: string, head: string): Promise<CommitDiff> {
    if (!SHA_RE.test(base) || !SHA_RE.test(head)) throw new ProviderError("not_found", "Invalid commit SHA.");
    const stat = await this.git(["diff", "--numstat", "--no-renames", "--no-ext-diff", "--no-textconv", base, head, "--"]);
    const files: DiffFile[] = [];
    let budget = MAX_PATCH_CHARS * 3;
    let truncated = false;
    for (const line of stat.trim().split("\n").filter(Boolean).slice(0, 40)) {
      const [add, del, ...rest] = line.split("\t");
      const path = rest.join("\t");
      let patch: string | null = null;
      if (add !== "-" && !SKIP_PATCH.test(path) && budget > 0) {
        const raw = await this.git(["diff", "--unified=3", "--no-color", "--no-ext-diff", "--no-textconv", base, head, "--", path]);
        const body = raw.slice(raw.indexOf("@@"));
        patch = body.length > MAX_PATCH_CHARS ? `${body.slice(0, MAX_PATCH_CHARS)}\n… [diff truncated]` : body;
        budget -= patch.length;
      } else if (budget <= 0) truncated = true;
      files.push({ path, additions: Number(add) || 0, deletions: Number(del) || 0, patch: patch ? sanitize(patch, knownSecrets()) : null });
    }
    return { base, head, files, truncated };
  }
}

function parseLog(out: string): RepoCommit[] {
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, author, date, message] = l.split("\x1f");
      return { sha, author, date, message };
    });
}

// --------------------------------------------------------------- GitHub

/**
 * The single allowlisted GitHub repository (PROOFLAYER_GITHUB_REPOSITORY).
 * Uses a read-only token when configured; a public repository also works
 * unauthenticated at GitHub's lower rate limit. The token never leaves the
 * server.
 */
export class GitHubProvider implements RepoProvider {
  private repo: string;

  constructor(locator: string) {
    if (!config.githubRepository) {
      throw new ProviderError(
        "connection_required",
        "No GitHub repository is configured. Set PROOFLAYER_GITHUB_REPOSITORY (and a read-only PROOFLAYER_GITHUB_TOKEN for private repositories).",
      );
    }
    if (locator.toLowerCase() !== config.githubRepository.toLowerCase()) {
      throw new ProviderError("forbidden", `Repository ${locator} is not on the allowlist.`);
    }
    this.repo = config.githubRepository;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ProofLayer",
    };
    if (config.githubToken) h.Authorization = `Bearer ${config.githubToken}`;
    return h;
  }

  private async api<T>(p: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`https://api.github.com/repos/${this.repo}${p}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch (e) {
      throw new ProviderError("upstream", `Could not reach GitHub: ${(e as Error).message}`);
    }
    if (res.status === 401) {
      throw new ProviderError("connection_required", "GitHub rejected the configured token (401). Check PROOFLAYER_GITHUB_TOKEN.");
    }
    if (res.status === 404) {
      throw new ProviderError(
        "not_found",
        config.githubToken
          ? `GitHub returned 404 for ${this.repo}${p}. The token may lack access to this repository.`
          : `GitHub returned 404 for ${this.repo}${p}. Private repositories need PROOFLAYER_GITHUB_TOKEN.`,
      );
    }
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      throw new ProviderError(
        "upstream",
        remaining === "0" ? "GitHub API rate limit reached. Add a token or wait for the limit to reset." : `GitHub returned ${res.status}.`,
      );
    }
    if (!res.ok) throw new ProviderError("upstream", `GitHub returned ${res.status}.`);
    return (await res.json()) as T;
  }

  async info(): Promise<RepoInfo> {
    const r = await this.api<{
      full_name: string;
      description: string | null;
      default_branch: string;
      html_url: string;
      visibility?: string;
      private: boolean;
    }>("");
    return {
      fullName: r.full_name,
      description: r.description,
      defaultBranch: r.default_branch,
      webUrl: r.html_url,
      visibility: r.visibility ?? (r.private ? "private" : "public"),
      provider: "github",
      authenticated: Boolean(config.githubToken),
    };
  }

  async branches(): Promise<RepoBranch[]> {
    const r = await this.api<Array<{ name: string; commit: { sha: string } }>>("/branches?per_page=100");
    return r.map((b) => ({ name: b.name, headSha: b.commit.sha }));
  }

  async commits(branch: string, limit = 20): Promise<RepoCommit[]> {
    if (!REF_RE.test(branch)) throw new ProviderError("not_found", "Invalid branch.");
    const r = await this.api<GhCommit[]>(
      `/commits?sha=${encodeURIComponent(branch)}&per_page=${Math.min(limit, 100)}`,
    );
    return r.map(mapGhCommit);
  }

  async resolve(ref: string): Promise<RepoCommit> {
    if (!REF_RE.test(ref) || ref.startsWith("-")) throw new ProviderError("not_found", "Invalid ref.");
    return mapGhCommit(await this.api<GhCommit>(`/commits/${encodeURIComponent(ref)}`));
  }

  async exportTo(sha: string, dir: string): Promise<void> {
    if (!SHA_RE.test(sha)) throw new ProviderError("not_found", "Invalid commit SHA.");
    fs.mkdirSync(dir, { recursive: true });
    const archive = path.join(dir, "..", `${path.basename(dir)}.tar.gz`);
    const res = await fetch(`https://api.github.com/repos/${this.repo}/tarball/${sha}`, {
      headers: this.headers(),
      redirect: "follow",
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok || !res.body) throw new ProviderError("upstream", `GitHub tarball download returned ${res.status}.`);
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(archive));
    await run("tar", ["-xzf", archive, "-C", dir, "--strip-components=1", "--no-same-owner"], { timeout: 120_000 });
    fs.rmSync(archive, { force: true });
  }

  async diff(base: string, head: string): Promise<CommitDiff> {
    if (!SHA_RE.test(base) || !SHA_RE.test(head)) throw new ProviderError("not_found", "Invalid commit SHA.");
    const r = await this.api<{ files?: Array<{ filename: string; additions: number; deletions: number; patch?: string }> }>(`/compare/${base}...${head}`);
    const files = (r.files ?? []).slice(0, 40).map((f) => ({
      path: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch && !SKIP_PATCH.test(f.filename) ? sanitize(f.patch.slice(0, MAX_PATCH_CHARS), knownSecrets()) : null,
    }));
    return { base, head, files, truncated: (r.files?.length ?? 0) > 40 };
  }

  async readFile(sha: string, file: string): Promise<string | null> {
    if (!SHA_RE.test(sha) || !SAFE_PATH(file)) return null;
    try {
      const r = await this.api<{ content?: string; encoding?: string }>(`/contents/${file.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`);
      return r.content && r.encoding === "base64" ? Buffer.from(r.content, "base64").toString("utf8") : null;
    } catch {
      return null;
    }
  }

  fileUrl(sha: string, file: string, line?: number): string | null {
    const clean = file.replace(/^\.?\//, "");
    if (clean.includes("..")) return null;
    return `https://github.com/${this.repo}/blob/${sha}/${clean}${line ? `#L${line}` : ""}`;
  }
}

interface GhCommit {
  sha: string;
  commit: { message: string; author: { name: string; date: string } | null };
}

function mapGhCommit(c: GhCommit): RepoCommit {
  return {
    sha: c.sha,
    message: c.commit.message.split("\n")[0],
    author: c.commit.author?.name ?? "unknown",
    date: c.commit.author?.date ?? "",
  };
}
