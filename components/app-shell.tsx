import type { ReactNode } from "react";
import { listRunsForProject } from "@/lib/server/store.ts";
import { getViewer, viewerProjects } from "@/lib/server/viewer.ts";
import { VERDICT_COPY } from "@/lib/ui/format.ts";
import { Shell } from "./shell.tsx";

/** Server wrapper: the projects and recent runs this viewer may see, for navigation. */
export async function AppShell({ children, projectSlug, banner, wide, minimal }: { children: ReactNode; projectSlug?: string; banner?: ReactNode; wide?: boolean; minimal?: boolean }) {
  const viewer = await getViewer();
  const projects = viewerProjects(viewer);
  const current = projects.find((p) => p.slug === projectSlug) ?? projects[0];
  const recent = current ? listRunsForProject(viewer.userId, current.id, 6) : [];
  return (
    <Shell
      userEmail={viewer.operator ? viewer.email : null}
      projectSlug={projectSlug ?? current?.slug}
      projects={projects.map((p) => ({ slug: p.slug, name: p.name, repo: p.connection.fullName }))}
      recentRuns={recent.map((r) => ({
        id: r.id,
        label: `${r.verdict ? VERDICT_COPY[r.verdict].label : r.status === "queued" ? "Queued" : "Running"} · ${r.commitMessage ?? r.commitSha.slice(0, 7)}`,
        hint: r.commitSha.slice(0, 7),
      }))}
      banner={banner}
      wide={wide}
      minimal={minimal}
    >
      {children}
    </Shell>
  );
}
