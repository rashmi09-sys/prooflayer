import { notFound, redirect } from "next/navigation";
import { getViewer, viewerProject } from "./viewer.ts";

/** A project page: open to the public demo for fixtures, everything for the operator. */
export async function projectContext(slug: string) {
  const viewer = await getViewer();
  const project = viewerProject(viewer, slug);
  if (!project) notFound();
  return { viewer, user: { id: viewer.userId }, project };
}

/** A page only the operator may use (starting checks). Visitors go back to the workspace. */
export async function operatorProjectContext(slug: string) {
  const ctx = await projectContext(slug);
  if (!ctx.viewer.operator) redirect(`/p/${slug}`);
  return ctx;
}
