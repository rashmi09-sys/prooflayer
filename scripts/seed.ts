// Creates the operator account and the projects ProofLayer is allowed to
// verify. Idempotent. Never creates runs: run history only comes from real
// executions.
import { config } from "../lib/server/config.ts";
import { getDb } from "../lib/server/db.ts";
import { ensureUser, upsertProject } from "../lib/server/store.ts";

getDb();
const ownerId = ensureUser(config.operatorEmail, "Operator");

upsertProject({
  ownerId,
  name: "Ledgerly",
  slug: "ledgerly",
  provider: "local",
  fullName: "demo/ledgerly",
  locator: "ledgerly",
  defaultBranch: "main",
  webUrl: null,
});
console.log("Project ready: Ledgerly (local fixture repository)");

upsertProject({
  ownerId,
  name: "DashDish",
  slug: "dashdish",
  provider: "local",
  fullName: "demo/dashdish",
  locator: "dashdish",
  defaultBranch: "main",
  webUrl: null,
});
console.log("Project ready: DashDish (local fixture repository)");

if (config.githubRepository) {
  const [owner, name] = config.githubRepository.split("/");
  upsertProject({
    ownerId,
    name,
    slug: `gh-${owner}-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    provider: "github",
    fullName: config.githubRepository,
    locator: config.githubRepository,
    defaultBranch: "main",
    webUrl: `https://github.com/${config.githubRepository}`,
  });
  console.log(`Project ready: ${config.githubRepository} (GitHub)`);
} else {
  console.log("No PROOFLAYER_GITHUB_REPOSITORY set; skipping the GitHub project.");
}
