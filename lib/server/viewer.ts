import { config } from "./config.ts";
import { ensureUser, getArtifactForUser, soleUserId, getProjectById, getProjectBySlug, getRunForUser, listProjects, type ProjectRecord } from "./store.ts";
import { projectMeta } from "../projects-meta.ts";

// Who is looking, and what they may see.
//
// The signed-in operator sees everything they own and can act on it. Anyone
// else gets the public demo: a read-only view of the operator's recorded runs
// for the public demo project only (DashDish). The public viewer can never
// start, cancel or repair a run, change settings, or read raw execution logs;
// every mutating API route independently requires an operator session, and in
// public demo mode (config.publicDemo) there is no operator at all.

export interface Viewer {
  /** The account whose data is shown (the operator's, in public mode). */
  userId: string;
  /** True only with a valid operator session. */
  operator: boolean;
  email: string | null;
}

/** The public demo project is the only one a visitor can see. */
export function isPublicProject(p: Pick<ProjectRecord, "slug" | "connection">): boolean {
  const meta = projectMeta(p.slug);
  return meta.fixture && Boolean(meta.publicDemo) && p.connection.provider === "local";
}

export async function getViewer(): Promise<Viewer> {
  // Loaded lazily so the pure access rules below can be unit tested outside Next.
  if (config.publicDemo) {
    // Read-only database: look the owner up, never create it. No owner means an empty demo, not an error.
    return { userId: soleUserId() ?? "usr_none", operator: false, email: null };
  }
  const { currentUser } = await import("./auth.ts");
  const user = await currentUser();
  if (user) return { userId: user.id, operator: true, email: user.email };
  const owner = ensureUser(config.operatorEmail, "Operator");
  return { userId: owner, operator: false, email: null };
}

export function viewerProjects(v: Viewer): ProjectRecord[] {
  const all = listProjects(v.userId);
  return v.operator ? all : all.filter(isPublicProject);
}

export function viewerProject(v: Viewer, slug: string): ProjectRecord | null {
  const p = getProjectBySlug(v.userId, slug);
  if (!p) return null;
  return v.operator || isPublicProject(p) ? p : null;
}

/** A run this viewer may read: owned by the account, and on a public project unless operator. */
export function viewerRun(v: Viewer, runId: string) {
  const run = getRunForUser(v.userId, runId);
  if (!run) return null;
  if (v.operator) return run;
  const project = getProjectById(run.projectId);
  return project && isPublicProject(project) ? run : null;
}

export function viewerArtifact(v: Viewer, runId: string, artifactId: string) {
  return viewerRun(v, runId) ? getArtifactForUser(v.userId, runId, artifactId) : null;
}

