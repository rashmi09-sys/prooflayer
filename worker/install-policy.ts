// What the worker allows before it runs `npm ci` on the host.
//
// `npm ci` runs outside the Docker sandbox (the sandbox has no network), so the
// repository under test must not be able to steer it. Two inputs from the
// repository can: a project .npmrc (for example `git=./script`, which npm runs
// as a program) and lockfile `resolved` URLs (git, file, or arbitrary hosts).
// The worker deletes the project .npmrc, pins npm's configuration through the
// environment (which takes precedence over any project file), and only installs
// lockfiles whose every package comes from the public npm registry with an
// integrity hash.

export const REGISTRY = "https://registry.npmjs.org/";

/** npm configuration for the install, as environment variables. */
export function pinnedNpmEnv(emptyUserConfig: string, emptyGlobalConfig: string): Record<string, string> {
  return {
    npm_config_registry: REGISTRY,
    npm_config_userconfig: emptyUserConfig,
    npm_config_globalconfig: emptyGlobalConfig,
    npm_config_ignore_scripts: "true",
    npm_config_git: "false-git-is-disabled",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  };
}

interface LockPackage {
  resolved?: unknown;
  integrity?: unknown;
  link?: unknown;
  inBundle?: unknown;
  version?: unknown;
}

/** Where npm writes an installed package: node_modules paths only, scoped names allowed, no traversal. */
const INSTALL_PATH = /^(?:node_modules\/(?:@[^/.][^/]*\/)?[^/.][^/]*\/)*node_modules\/(?:@[^/.][^/]*\/)?[^/.][^/]*$/;
/** A workspace folder inside the repository. */
const WORKSPACE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@/-]{1,200}$/;

/** Lockfiles npm would read instead of, or as well as, package-lock.json. */
export const ALTERNATE_LOCKFILES = ["npm-shrinkwrap.json"];

/**
 * Problems that make a package-lock.json unsafe to install on the host; empty
 * when every dependency is a registry tarball with an integrity hash (or a
 * workspace link inside the repository).
 */
export function lockfileProblems(lockText: string): string[] {
  let lock: { lockfileVersion?: unknown; packages?: Record<string, LockPackage> };
  try {
    lock = JSON.parse(lockText);
  } catch {
    return ["package-lock.json is not valid JSON."];
  }
  if (typeof lock.lockfileVersion !== "number" || lock.lockfileVersion < 2 || !lock.packages || typeof lock.packages !== "object") {
    return ["package-lock.json must be lockfileVersion 2 or 3 (npm 7+)."];
  }
  const problems: string[] = [];
  for (const [key, pkg] of Object.entries(lock.packages)) {
    if (key === "") continue; // the root project
    if (!key.startsWith("node_modules/")) {
      // A workspace package: source inside this repository, nothing to download.
      if (!WORKSPACE_PATH.test(key) || pkg.resolved !== undefined) problems.push(`${key.slice(0, 80)}: not a workspace folder inside the repository.`);
      continue;
    }
    if (!INSTALL_PATH.test(key)) {
      problems.push(`${key.slice(0, 80)}: not a node_modules install path.`);
      continue;
    }
    if (pkg.inBundle === true && pkg.resolved === undefined) continue; // shipped inside a parent registry tarball
    if (pkg.link === true) {
      const target = typeof pkg.resolved === "string" ? pkg.resolved : "";
      if (!target || target.startsWith("/") || target.split("/").includes("..") || /^[a-z]+:/i.test(target)) {
        problems.push(`${key}: links outside the repository (${String(pkg.resolved).slice(0, 80)}).`);
      }
      continue;
    }
    if (typeof pkg.resolved !== "string" || !pkg.resolved.startsWith(REGISTRY)) {
      problems.push(`${key}: not from the npm registry (${String(pkg.resolved ?? "no resolved URL").slice(0, 80)}).`);
    } else if (typeof pkg.integrity !== "string" || !/^sha(256|384|512)-/.test(pkg.integrity)) {
      problems.push(`${key}: has no integrity hash.`);
    }
    if (problems.length >= 10) {
      problems.push("…");
      break;
    }
  }
  return problems;
}
